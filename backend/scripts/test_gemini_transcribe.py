# Test script for verifying Gemini 3.5 Transcribe access
import os
import io
import time
import wave
import json
from dotenv import load_dotenv

# Load backend environment variables
load_dotenv('.env')

from google import genai
from google.genai import types

def sanitize(text: str, keys: list) -> str:
    s = str(text)
    for k in keys:
        if k and len(k) > 4:
            s = s.replace(k, '[REDACTED_API_KEY]')
    return s

def get_audio_clip() -> bytes:
    wav_path = os.path.abspath(os.path.join('..', 'storage', 'audio', 'rec_20260820_072106_482180.wav'))
    with wave.open(wav_path, 'rb') as wf:
        params = wf.getparams()
        nchannels, sampwidth, framerate, nframes = params[:4]
        start_frame = int(8.0 * framerate)
        num_frames = int(13.0 * framerate)
        wf.setpos(start_frame)
        audio_frames = wf.readframes(num_frames)

    buf = io.BytesIO()
    with wave.open(buf, 'wb') as out_wf:
        out_wf.setnchannels(nchannels)
        out_wf.setsampwidth(sampwidth)
        out_wf.setframerate(framerate)
        out_wf.writeframes(audio_frames)

    return buf.getvalue()

def run_test():
    p_key = os.environ.get('GEMINI_API_KEY', '').strip()
    b_key = os.environ.get('GEMINI_BACKUP_KEY', '').strip()
    active_keys = [k for k in [p_key, b_key] if k]

    audio_bytes = get_audio_clip()
    print(f'[SETUP] Loaded 13.0s WAV audio clip: {len(audio_bytes)} bytes (48kHz 16-bit mono PCM)')

    results = {}

    for slot, key in [('primary', p_key), ('backup', b_key)]:
        print(f'\n========== TESTING {slot.upper()} KEY ==========')
        if not key:
            print(f'FAIL: {slot} key not configured in .env')
            results[slot] = {'status': 'FAIL', 'error': 'Not configured'}
            continue

        client = genai.Client(api_key=key)
        start_time = time.perf_counter()
        try:
            response = client.models.generate_content(
                model='gemini-3.5-transcribe',
                contents=[
                    types.Part.from_bytes(data=audio_bytes, mime_type='audio/wav')
                ]
            )
            elapsed = time.perf_counter() - start_time
            transcript_text = response.text or ''
            
            parts_info = []
            if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                for idx, part in enumerate(response.candidates[0].content.parts):
                    part_dict = {'index': idx}
                    if part.text:
                        part_dict['text'] = part.text
                    if getattr(part, 'thought', None):
                        part_dict['thought'] = str(part.thought)[:100] + '...'
                    if getattr(part, 'audio_transcription', None):
                        trans_obj = part.audio_transcription
                        part_dict['audio_transcription'] = str(trans_obj)
                        if not transcript_text and getattr(trans_obj, 'text', None):
                            transcript_text = trans_obj.text
                    parts_info.append(part_dict)

            usage = {}
            if response.usage_metadata:
                usage = {
                    'prompt_tokens': getattr(response.usage_metadata, 'prompt_token_count', None),
                    'candidates_tokens': getattr(response.usage_metadata, 'candidates_token_count', None),
                    'total_tokens': getattr(response.usage_metadata, 'total_token_count', None),
                }

            print(f'STATUS: PASS (HTTP 200 OK)')
            print(f'Latency: {elapsed:.2f} seconds')
            print(f'Transcript: "{transcript_text}"')
            print(f'Usage: {usage}')
            print(f'Candidate Parts: {parts_info}')

            results[slot] = {
                'status': 'PASS',
                'http_status': 200,
                'latency_sec': round(elapsed, 2),
                'transcript': transcript_text,
                'usage': usage,
                'parts': parts_info,
            }
        except Exception as e:
            elapsed = time.perf_counter() - start_time
            err_msg = sanitize(str(e), active_keys)
            err_class = type(e).__name__
            status_code = getattr(e, 'code', None) or getattr(e, 'status_code', None)
            print(f'STATUS: FAIL')
            print(f'Latency: {elapsed:.2f} seconds')
            print(f'Error Class: {err_class}')
            print(f'Status Code: {status_code}')
            print(f'Error Message: {err_msg[:300]}')

            results[slot] = {
                'status': 'FAIL',
                'http_status': status_code,
                'latency_sec': round(elapsed, 2),
                'error_class': err_class,
                'error_message': err_msg,
            }

    print('\n========== SUMMARY RESULTS ==========')
    print(json.dumps(results, indent=2))

if __name__ == '__main__':
    run_test()
