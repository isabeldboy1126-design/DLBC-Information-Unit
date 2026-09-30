"""
Audio Capture & Streaming Endpoints

Provides:
- WebSocket endpoint `/api/audio/stream` for low-latency, progressive PCM chunk streaming
- REST endpoints for listing, retrieving (with Range support for in-browser seeking), and downloading WAV recordings
"""

import asyncio
import json
import os
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from app.audio.stream_manager import (
    MANIFEST_FILE,
    STORAGE_AUDIO_DIR,
    load_manifest,
    save_manifest,
    stream_manager,
)
from app.database.session_repo import session_repo
from app.transcription.live_transcription import LiveTranscriptionSession
from app.verification.decision_engine import verification_decision_engine

router = APIRouter(prefix="/api/audio", tags=["Audio Capture"])


@router.websocket("/stream")
async def audio_stream_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for progressive audio capture & live transcription (Phase 4 Session).

    Protocol:
    1. Client connects.
    2. Client sends initial JSON message:
       {"type": "init", "sampleRate": 48000, "channels": 1, "deviceName": "Microphone", "sessionId": "...", "sessionTitle": "..."}
    3. Server replies with JSON:
       {"status": "ready", "recordingId": "...", "sessionId": "..."}
    4. Client progressively streams binary messages containing raw LINEAR16 Int16 PCM chunks.
       Server appends each chunk directly to disk (primary capture path) and feeds a copy
       to the non-blocking LiveTranscription worker.
    5. Server pushes real-time events:
       - live_transcript_interim
       - live_transcript_segment
       - live_transcription_status
    6. Client can send manual flag control:
       {"type": "toggle_flag", "segment_idx": 3}
    7. Client sends termination message:
       {"type": "stop"}
       Server finalizes the WAV file, raw transcript, and SQLite session, then returns completion payload:
       {"status": "finalized", "recording": {...}, "transcript": {...}, "session": {...}}
    8. If client disconnects unexpectedly, server auto-finalizes whatever audio, transcript, and session state were received.
    """
    await websocket.accept()
    current_session = None
    current_session_id = None
    live_transcription: Optional[LiveTranscriptionSession] = None
    loop = asyncio.get_event_loop()
    ws_lock = asyncio.Lock()

    async def safe_send_json(payload: dict):
        try:
            async with ws_lock:
                await websocket.send_json(payload)
        except Exception as ws_err:
            pass

    try:
        while True:
            message = await websocket.receive()

            # Handle text/JSON control messages
            if "text" in message:
                try:
                    payload = json.loads(message["text"])
                except Exception:
                    await safe_send_json({"status": "error", "message": "Invalid JSON control payload"})
                    continue

                msg_type = payload.get("type")

                if msg_type == "init":
                    sample_rate = int(payload.get("sampleRate", 48000))
                    channels = int(payload.get("channels", 1))
                    device_name = str(payload.get("deviceName", "Default Microphone"))
                    custom_session_id = payload.get("sessionId")
                    session_title = payload.get("sessionTitle")

                    current_session = stream_manager.create_session(
                        sample_rate=sample_rate,
                        channels=channels,
                        device_name=device_name,
                    )
                    current_session_id = custom_session_id or f"session_{current_session.session_id}"

                    custom_metadata = payload.get("metadata") or {}
                    metadata_to_store = {
                        "sample_rate": sample_rate,
                        "channels": channels,
                        "device_name": device_name,
                        **custom_metadata,
                    }

                    # Initialize durable session in SQLite
                    try:
                        await session_repo.create_session(
                            session_id=current_session_id,
                            title=session_title,
                            recording_id=current_session.session_id,
                            status="recording",
                            provider_name="azure_speech",
                            language_code="en-NG",
                            start_time=current_session.start_time,
                            metadata=metadata_to_store,
                        )
                    except Exception as s_err:
                        print(f"Notice: Failed to initialize SQLite session: {s_err}")

                    # Initialize isolated live transcription session
                    try:
                        live_transcription = LiveTranscriptionSession(
                            recording_id=current_session.session_id,
                            session_id=current_session_id,
                            sample_rate=sample_rate,
                            channels=channels,
                            language_code="en-NG",
                            ws_send_callback=safe_send_json,
                            event_loop=loop,
                        )
                        live_transcription.start()
                    except Exception as lt_err:
                        print(f"Notice: Failed to initialize live transcription: {lt_err}")
                        live_transcription = None

                    await safe_send_json({
                        "status": "ready",
                        "recordingId": current_session.session_id,
                        "sessionId": current_session_id,
                        "sampleRate": sample_rate,
                        "channels": channels,
                    })

                elif msg_type == "toggle_flag":
                    if live_transcription:
                        seg_idx = int(payload.get("segment_idx", -1))
                        live_transcription.toggle_manual_flag(seg_idx)

                elif msg_type == "stop":
                    if current_session:
                        summary = stream_manager.finalize_session(current_session.session_id)
                        transcript_summary = None
                        if live_transcription:
                            try:
                                transcript_summary = live_transcription.finalize(wav_summary=summary)
                            except Exception as trans_err:
                                print(f"Notice: Live transcription finalize error: {trans_err}")

                        # Finalize SQLite Session record
                        final_session = None
                        if current_session_id:
                            try:
                                final_session = await session_repo.finalize_session(
                                    session_id=current_session_id,
                                    audio_summary=summary,
                                    transcript_summary=transcript_summary,
                                )
                                # Stage 6: Automatic post-recording AI verification workflow
                                await session_repo.set_ai_verification_status(current_session_id, "compiling")
                                asyncio.create_task(
                                    verification_decision_engine.verify_session(current_session_id, auto_resolve=True)
                                )
                            except Exception as db_err:
                                print(f"Notice: Error finalizing session in DB: {db_err}")

                        await safe_send_json({
                            "status": "finalized",
                            "recording": summary,
                            "transcript": transcript_summary,
                            "session": final_session,
                        })
                        current_session = None
                        current_session_id = None
                        live_transcription = None
                        break
                    else:
                        await safe_send_json({"status": "error", "message": "No active session to stop"})

                elif msg_type == "ping":
                    await safe_send_json({"type": "pong"})

            # Handle binary PCM chunks
            elif "bytes" in message:
                pcm_data = message["bytes"]
                if current_session and pcm_data:
                    # 1. Immediate primary disk append (NEVER blocked)
                    current_session.append_chunk(pcm_data)

                    # 2. Non-blocking push to live transcription worker
                    if live_transcription:
                        live_transcription.push_pcm(pcm_data)

                    # Periodically send progress or ack
                    if current_session.chunk_count % 20 == 0:
                        await safe_send_json({
                            "type": "progress",
                            "totalBytes": current_session.total_bytes,
                            "chunkCount": current_session.chunk_count,
                        })


    except WebSocketDisconnect:
        # If the browser closes or crashes abruptly, auto-finalize to save captured audio and transcript!
        if current_session:
            print(f"Client disconnected abruptly. Auto-finalizing audio session: {current_session.session_id}")
            summary = stream_manager.finalize_session(current_session.session_id)
            transcript_summary = None
            if live_transcription:
                try:
                    transcript_summary = live_transcription.finalize(wav_summary=summary)
                except Exception:
                    pass
            if current_session_id:
                try:
                    await session_repo.finalize_session(
                        session_id=current_session_id,
                        audio_summary=summary,
                        transcript_summary=transcript_summary,
                    )
                    await session_repo.set_ai_verification_status(current_session_id, "compiling")
                    asyncio.create_task(
                        verification_decision_engine.verify_session(current_session_id, auto_resolve=True)
                    )
                except Exception:
                    pass
    except Exception as e:
        print(f"WebSocket audio streaming error: {e}")
        if current_session:
            summary = stream_manager.finalize_session(current_session.session_id)
            transcript_summary = None
            if live_transcription:
                try:
                    transcript_summary = live_transcription.finalize(wav_summary=summary)
                except Exception:
                    pass
            if current_session_id:
                try:
                    await session_repo.finalize_session(
                        session_id=current_session_id,
                        audio_summary=summary,
                        transcript_summary=transcript_summary,
                    )
                except Exception:
                    pass




@router.get("/recordings")
async def list_recordings():
    """Returns a list of all saved audio recordings from the local storage manifest."""
    manifest = load_manifest()
    # Filter out any files that might have been manually deleted from disk
    valid_recordings = []
    for item in manifest:
        file_path = item.get("file_path", "")
        if os.path.exists(file_path):
            # Ensure URL paths are included
            rec_id = item.get("recording_id")
            item["play_url"] = f"/api/audio/recordings/{rec_id}"
            item["download_url"] = f"/api/audio/recordings/{rec_id}/download"
            valid_recordings.append(item)
    return {"recordings": valid_recordings}


@router.get("/recordings/{recording_id}")
async def get_recording_audio(recording_id: str, request: Request):
    """
    Streams a saved WAV file supporting HTTP Range requests
    for seamless seeking in browser HTML5 audio player.
    """
    file_path = os.path.join(STORAGE_AUDIO_DIR, f"{recording_id}.wav")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Recording not found")

    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("range")

    if range_header:
        # Parse byte range header
        try:
            byte_range = range_header.replace("bytes=", "").split("-")
            start = int(byte_range[0])
            end = int(byte_range[1]) if byte_range[1] else file_size - 1
        except Exception:
            start = 0
            end = file_size - 1

        chunk_size = (end - start) + 1

        def iterfile():
            with open(file_path, "rb") as f:
                f.seek(start)
                bytes_left = chunk_size
                while bytes_left > 0:
                    read_len = min(65536, bytes_left)
                    data = f.read(read_len)
                    if not data:
                        break
                    bytes_left -= len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_size),
            "Content-Type": "audio/wav",
        }
        return StreamingResponse(iterfile(), status_code=206, headers=headers)

    return FileResponse(file_path, media_type="audio/wav", filename=f"{recording_id}.wav")


@router.get("/recordings/{recording_id}/download")
async def download_recording(recording_id: str):
    """Provides a direct file download for the saved WAV recording."""
    file_path = os.path.join(STORAGE_AUDIO_DIR, f"{recording_id}.wav")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Recording not found")
    return FileResponse(
        file_path,
        media_type="audio/wav",
        filename=f"{recording_id}.wav",
        headers={"Content-Disposition": f'attachment; filename="{recording_id}.wav"'},
    )


@router.delete("/recordings/{recording_id}")
async def delete_recording(recording_id: str):
    """Original recordings are protected; archive their linked session instead."""
    raise HTTPException(status_code=409,
                        detail="Original recordings are preserved. Archive the linked session to remove it from active work.")
