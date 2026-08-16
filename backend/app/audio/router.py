"""
Audio Capture & Streaming Endpoints

Provides:
- WebSocket endpoint `/api/audio/stream` for low-latency, progressive PCM chunk streaming
- REST endpoints for listing, retrieving (with Range support for in-browser seeking), and downloading WAV recordings
"""

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

router = APIRouter(prefix="/api/audio", tags=["Audio Capture"])


@router.websocket("/stream")
async def audio_stream_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for progressive audio capture.

    Protocol:
    1. Client connects.
    2. Client sends initial JSON message:
       {"type": "init", "sampleRate": 48000, "channels": 1, "deviceName": "Realtek Microphone"}
    3. Server replies with JSON:
       {"status": "ready", "recordingId": "..."}
    4. Client progressively streams binary messages containing raw LINEAR16 Int16 PCM chunks.
       Server appends each chunk directly to disk.
    5. Client sends termination message:
       {"type": "stop"}
       Server finalizes the WAV file and returns completion payload:
       {"status": "finalized", "recording": {...}}
    6. If client disconnects unexpectedly, server auto-finalizes whatever audio was received.
    """
    await websocket.accept()
    current_session = None

    try:
        while True:
            message = await websocket.receive()

            # Handle text/JSON control messages
            if "text" in message:
                try:
                    payload = json.loads(message["text"])
                except Exception:
                    await websocket.send_json({"status": "error", "message": "Invalid JSON control payload"})
                    continue

                msg_type = payload.get("type")

                if msg_type == "init":
                    sample_rate = int(payload.get("sampleRate", 48000))
                    channels = int(payload.get("channels", 1))
                    device_name = str(payload.get("deviceName", "Default Microphone"))

                    current_session = stream_manager.create_session(
                        sample_rate=sample_rate,
                        channels=channels,
                        device_name=device_name,
                    )

                    await websocket.send_json({
                        "status": "ready",
                        "recordingId": current_session.session_id,
                        "sampleRate": sample_rate,
                        "channels": channels,
                    })

                elif msg_type == "stop":
                    if current_session:
                        summary = stream_manager.finalize_session(current_session.session_id)
                        await websocket.send_json({
                            "status": "finalized",
                            "recording": summary,
                        })
                        current_session = None
                        break
                    else:
                        await websocket.send_json({"status": "error", "message": "No active session to stop"})

                elif msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

            # Handle binary PCM chunks
            elif "bytes" in message:
                pcm_data = message["bytes"]
                if current_session and pcm_data:
                    current_session.append_chunk(pcm_data)
                    # Periodically send progress or ack
                    if current_session.chunk_count % 20 == 0:
                        await websocket.send_json({
                            "type": "progress",
                            "totalBytes": current_session.total_bytes,
                            "chunkCount": current_session.chunk_count,
                        })

    except WebSocketDisconnect:
        # If the browser closes or crashes abruptly, auto-finalize to save captured audio!
        if current_session:
            print(f"Client disconnected abruptly. Auto-finalizing audio session: {current_session.session_id}")
            stream_manager.finalize_session(current_session.session_id)
    except Exception as e:
        print(f"WebSocket audio streaming error: {e}")
        if current_session:
            stream_manager.finalize_session(current_session.session_id)


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
    """Deletes a recording from disk and updates the manifest."""
    file_path = os.path.join(STORAGE_AUDIO_DIR, f"{recording_id}.wav")
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to delete file: {e}")

    manifest = load_manifest()
    manifest = [item for item in manifest if item.get("recording_id") != recording_id]
    save_manifest(manifest)

    return {"status": "deleted", "recordingId": recording_id}
