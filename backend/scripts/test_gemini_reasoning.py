# Test script for verifying Gemini reasoning model access (gemini-3.8-flash)
import os
import time
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

def run_test():
    p_key = os.environ.get('GEMINI_API_KEY', '').strip()
    b_key = os.environ.get('GEMINI_BACKUP_KEY', '').strip()
    active_keys = [k for k in [p_key, b_key] if k]

    test_prompt = "Reply with exactly: OK"
    target_model = os.environ.get("GEMINI_VERIFICATION_MODEL", "gemini-3.8-flash")
    print(f'[SETUP] Target reasoning model: {target_model}')
    print(f'[SETUP] Minimal test prompt: "{test_prompt}"')

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
                model=target_model,
                contents=test_prompt
            )
            elapsed = time.perf_counter() - start_time
            reply_text = (response.text or '').strip()
            
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
            usage = {}
            if response.usage_metadata:
                usage = {
                    'prompt_tokens': getattr(response.usage_metadata, 'prompt_token_count', None),
                    'candidates_tokens': getattr(response.usage_metadata, 'candidates_token_count', None),
                    'total_tokens': getattr(response.usage_metadata, 'total_token_count', None),
                }

            print(f'STATUS: PASS (HTTP 200 OK)')
            print(f'Latency: {elapsed:.2f} seconds')
            print(f'Reply: "{reply_text}"')
            print(f'Usage: {usage}')

            results[slot] = {
                'status': 'PASS',
                'http_status': 200,
                'latency_sec': round(elapsed, 2),
                'reply': reply_text,
                'usage': usage,
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
