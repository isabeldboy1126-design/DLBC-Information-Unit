/**
 * PCM Recorder AudioWorkletProcessor
 *
 * Runs in the dedicated Web Audio rendering thread.
 * Captures Float32 audio samples, converts to 16-bit signed integer PCM (LINEAR16),
 * buffers into transmission-sized blocks, and posts transferable ArrayBuffers to the main thread.
 */

class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096; // ~85ms at 48kHz, ~92ms at 44.1kHz
    this.buffer = new Int16Array(this.bufferSize);
    this.bufferIndex = 0;
    this.isRecording = true;

    this.port.onmessage = (event) => {
      if (event.data && event.data.command === 'stop') {
        this.flush();
        this.isRecording = false;
      } else if (event.data && event.data.command === 'start') {
        this.bufferIndex = 0;
        this.isRecording = true;
      }
    };
  }

  flush() {
    if (this.bufferIndex > 0) {
      const chunk = this.buffer.slice(0, this.bufferIndex);
      this.port.postMessage(
        { type: 'chunk', buffer: chunk.buffer },
        [chunk.buffer]
      );
      this.bufferIndex = 0;
    }
  }

  process(inputs) {
    if (!this.isRecording) {
      return true;
    }

    const input = inputs[0];
    if (!input || input.length === 0) {
      return true;
    }

    const numChannels = input.length;
    const channel0 = input[0];
    const frameLength = channel0.length;

    for (let i = 0; i < frameLength; i++) {
      let sample = 0;
      if (numChannels === 1) {
        sample = channel0[i];
      } else {
        // Downmix multi-channel to mono
        for (let ch = 0; ch < numChannels; ch++) {
          sample += input[ch][i];
        }
        sample = sample / numChannels;
      }

      // Hard clamp between -1.0 and 1.0
      sample = Math.max(-1, Math.min(1, sample));

      // Convert Float32 to 16-bit Signed Integer PCM (-32768 to 32767)
      const intSample = sample < 0 ? sample * 32768 : sample * 32767;
      this.buffer[this.bufferIndex++] = Math.round(intSample);

      // When the chunk buffer is full, post transferable ArrayBuffer
      if (this.bufferIndex >= this.bufferSize) {
        const fullChunk = new Int16Array(this.buffer);
        this.port.postMessage(
          { type: 'chunk', buffer: fullChunk.buffer },
          [fullChunk.buffer]
        );
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-recorder-processor', PCMRecorderProcessor);
