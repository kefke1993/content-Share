/* js/upload.js
   Logica voor het uploaden van bestanden naar Google Drive via resumable upload-sessies.
   - Vraagt per bestand een resumable session URL aan bij de Apps Script web-app.
   - Stuurt het bestand in chunks via PUT direct naar de session URL.
   - Ondersteunt hervatten via status-check (PUT Content-Range: bytes */total).
   - Per-chunk exponential backoff en MAX_RETRIES_PER_CHUNK.
   - Gebruikt file.slice(start, end) voor chunking.
*/

/* ==================== Helpers en types ==================== */

/**
 * Maak een unieke bestandsnaam: timestamp + korte random code + originele naam
 * Voorbeeld: 20261019T210305-5gk2a-IMG_1234.mov
 */
function makeUniqueFilename(originalName) {
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const d = new Date();
  const timestamp = d.getFullYear()
    + pad(d.getMonth()+1)
    + pad(d.getDate()) + 'T'
    + pad(d.getHours())
    + pad(d.getMinutes())
    + pad(d.getSeconds());
  const rnd = Math.random().toString(36).slice(2, 7);
  return `${timestamp}-${rnd}-${originalName}`;
}

/* Parse "Range" header zoals "bytes=0-12345" => return laatste byte number, of -1 indien niet aanwezig */
function parseRangeHeader(rangeHeader) {
  if (!rangeHeader) return -1;
  const m = /bytes=(\d+)-(\d+)/.exec(rangeHeader);
  if (!m) return -1;
  return parseInt(m[2], 10);
}

/* Sleep helper (ms) */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* Exponential backoff delay in ms with jitter */
function backoffDelay(attempt) {
  const base = RETRY_BASE_DELAY_MS || 800;
  const jitter = Math.random() * 200;
  return Math.round(Math.pow(2, attempt) * base + jitter);
}

/* ==================== Requests to Apps Script ==================== */

/**
 * Vraag bij het Apps Script een resumable upload sessie aan.
 * We sturen body als plain text (JSON string) om preflight te vermijden.
 * Return: uploadUrl (string) of throw Error.
 */
async function requestUploadSession(uniqueFilename, mimeType, size) {
  if (!APPS_SCRIPT_URL) throw new Error('APPS_SCRIPT_URL niet ingesteld in js/config.js');

  const payload = JSON.stringify({
    name: uniqueFilename,
    mimeType: mimeType || 'application/octet-stream',
    size: size || 0
  });

  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain' // voorkomt CORS preflight
    },
    body: payload,
    redirect: 'follow'
  });

  if (!res.ok) {
    const text = await res.text().catch(()=>'');
    throw new Error('Kon geen uploadsessie aanvragen: ' + (text || res.statusText));
  }

  const json = await res.json().catch(()=>null);
  if (!json || !json.uploadUrl) throw new Error('Geen upload URL teruggekregen van Apps Script.');

  return json.uploadUrl;
}

/**
 * Vraag server naar de huidige offset (hoeveel bytes zijn al geaccepteerd).
 * Dit gebeurt door een PUT met 'Content-Range: bytes */total' en geen body.
 * Als server 308 terugstuurt met header 'Range', parseer die.
 * Return: nextOffset (number)
 */
async function checkUploadOffset(sessionUrl, total) {
  // Fetch PUT zonder body; mute exceptions for network errors
  try {
    const res = await fetch(sessionUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes */${total}`
      }
    });

    // 308 is resume incomplete: header 'Range' e.g. 'bytes=0-12345'
    if (res.status === 308) {
      const range = res.headers.get('Range') || res.headers.get('range');
      const last = parseRangeHeader(range);
      return last >= 0 ? last + 1 : 0;
    }

    // 200 / 201 => upload complete
    if (res.status === 200 || res.status === 201) {
      return total;
    }

    // Anders: assume nothing ontvangen
    return 0;
  } catch (err) {
    // netwerkfout: laat caller beslissen (hervatten zal later proberen)
    throw err;
  }
}

/* ==================== Chunk upload ==================== */

/**
 * Upload één chunk (start..end-1) van 'file' naar sessionUrl.
 * Probeer maximaal maxRetries keer met exponential backoff.
 * Return: object {nextOffset, done} where nextOffset is the next byte to send, done=true if file finished.
 */
async function uploadChunkWithRetries(sessionUrl, file, start, end, attemptStart = 0) {
  const total = file.size;
  let attempt = attemptStart;

  while (true) {
    try {
      const chunkBlob = file.slice(start, end);
      const headers = {
        'Content-Type': file.type || 'application/octet-stream',
        'Content-Range': `bytes ${start}-${end-1}/${total}`
      };

      const res = await fetch(sessionUrl, {
        method: 'PUT',
        headers,
        body: chunkBlob
      });

      // 308 => not complete, may include Range header for last received byte
      if (res.status === 308) {
        const range = res.headers.get('Range') || res.headers.get('range');
        const last = parseRangeHeader(range);
        const nextOffset = (last >= 0) ? last + 1 : end;
        return { nextOffset: nextOffset, done: false };
      }

      // 200 or 201 => file complete
      if (res.status === 200 || res.status === 201) {
        return { nextOffset: total, done: true };
      }

      // 4xx/5xx: treat as retryable for >500; for 4xx we may abort.
      if (res.status >= 500 && res.status < 600) {
        throw new Error('Server error ' + res.status);
      } else {
        // For other statuses, treat as fatal
        const txt = await res.text().catch(()=>res.statusText);
        throw new Error('Upload fout: ' + (txt || res.status));
      }
    } catch (err) {
      // netwerk- of serverfout -> retry met backoff
      if (attempt >= MAX_RETRIES_PER_CHUNK) {
        // maximaal bereikt
        throw new Error(`Chunk mislukt na ${MAX_RETRIES_PER_CHUNK} pogingen: ${err.message}`);
      }
      const delay = backoffDelay(attempt);
      await sleep(delay);
      attempt++;
      // probeer eerst de huidige offset bij server na netwerkissues
      try {
        const resumedOffset = await checkUploadOffset(sessionUrl, file.size);
        if (resumedOffset > start) {
          // server heeft meer bytes dan wij dachten - verstuur vanaf daar
          return { nextOffset: resumedOffset, done: false };
        }
      } catch (e) {
        // negeer en probeer chunk opnieuw
      }
      // ga opnieuw proberen (while loop)
    }
  }
}

/**
 * Upload het volledige bestand in chunks.
 * Geeft progress via onProgress(uploadedBytes, totalBytes).
 * Return: resolved wanneer het hele bestand geüpload is; reject op fout.
 */
async function uploadFileInChunks(sessionUrl, file, onProgress) {
  const total = file.size;
  let offset = 0;

  // Controleer eerst of er al bytes bij server zijn (hervatten)
  try {
    offset = await checkUploadOffset(sessionUrl, total);
  } catch (err) {
    // bij netwerkfout: blijf offset 0 en probeer verder; caller kan herstarten.
    offset = 0;
  }

  while (offset < total) {
    const chunkEnd = Math.min(offset + CHUNK_SIZE_BYTES, total);
    // upload chunk met retrypolicy
    const res = await uploadChunkWithRetries(sessionUrl, file, offset, chunkEnd, 0);
    offset = res.nextOffset;
    if (onProgress) onProgress(offset, total);
    if (res.done) break;
  }

  if (offset >= total) return;
  throw new Error('Upload gestopt voordat het bestand volledig was verzonden.');
}

/* ==================== Upload queue & controller ==================== */

/*
  Exposeer één functie: startUploads(files, callbacks)
  - files: FileList of Array<File>
  - callbacks: {onFileStart, onFileProgress, onFileDone, onFileFailed, onOverallProgress}
*/
const uploadController = (function () {
  let activeUploads = 0;
  const queue = [];
  let stopped = false;

  async function processQueue() {
    if (stopped) return;
    while (activeUploads < CONCURRENT_UPLOADS && queue.length > 0) {
      const item = queue.shift();
      activeUploads++;
      // Fire and forget but catch errors to update UI
      (async () => {
        try {
          await handleFileUpload(item);
        } finally {
          activeUploads--;
          // continue processing queue
          processQueue();
        }
      })();
    }
  }

  async function handleFileUpload(item) {
    const { file, uniqueName, callbacks } = item;
    try {
      callbacks.onFileStart && callbacks.onFileStart(item);

      // Vraag session URL
      const sessionUrl = await requestUploadSession(uniqueName, file.type, file.size);

      // Upload in chunks, rapporteren via onFileProgress
      await uploadFileInChunks(sessionUrl, file, (uploadedBytes, total) => {
        callbacks.onFileProgress && callbacks.onFileProgress(item, uploadedBytes, total);
        callbacks.onOverallProgress && callbacks.onOverallProgress();
      });

      callbacks.onFileDone && callbacks.onFileDone(item);
    } catch (err) {
      callbacks.onFileFailed && callbacks.onFileFailed(item, err);
    }
  }

  function addFiles(fileArray, callbacks) {
    for (const f of fileArray) {
      const unique = makeUniqueFilename(f.name);
      queue.push({
        file: f,
        uniqueName: unique,
        callbacks,
        id: Math.random().toString(36).slice(2,9)
      });
    }
    // start processing
    processQueue();
    callbacks.onOverallProgress && callbacks.onOverallProgress();
  }

  function retryFile(item, callbacks) {
    // zet opnieuw in front van queue
    queue.unshift(item);
    processQueue();
  }

  function stopAll() {
    stopped = true;
  }

  function resume() {
    stopped = false;
    processQueue();
  }

  function countActive() { return activeUploads + queue.length; }

  return {
    addFiles,
    retryFile,
    stopAll,
    resume,
    countActive
  };
})();
