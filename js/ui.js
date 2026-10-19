/* js/ui.js
   UI-logica: bestandsselectie, drag & drop, rendering van de bestandlijst,
   voortgangsupdate, wake lock en beforeunload-waarschuwing.
*/

/* ===== Elementen ===== */
const chooseFilesButton = document.getElementById('chooseFilesButton');
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const filesList = document.getElementById('filesList');
const overallProgress = document.getElementById('overallProgress');
const warningBox = document.getElementById('warning');
const thanksBox = document.getElementById('thanks');
const addMoreButton = document.getElementById('addMoreButton');
const guestNameInput = document.getElementById('guestNameInput');

let wakeLock = null;
let uploadingCount = 0;
const fileItems = new Map(); // id => {item data, dom nodes}

/* ===== Wake Lock & beforeunload ===== */
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      // Release on visibilitychange
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && !wakeLock) {
          try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
        }
      });
    } catch (err) {
      // Niet ondersteund of geweigerd; negeer stilletjes
      wakeLock = null;
    }
  }
}

async function releaseWakeLock() {
  if (wakeLock && wakeLock.release) {
    try { await wakeLock.release(); } catch (e) {}
    wakeLock = null;
  }
}

function setBeforeUnload(enabled) {
  if (enabled) {
    window.addEventListener('beforeunload', beforeUnloadHandler);
  } else {
    window.removeEventListener('beforeunload', beforeUnloadHandler);
  }
}

function beforeUnloadHandler(e) {
  e.preventDefault();
  e.returnValue = '';
}

/* ===== UI Rendering helpers ===== */
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024*1024)).toFixed(1) + ' MB';
  return (bytes / (1024*1024*1024)).toFixed(2) + ' GB';
}

function createFileCard(item) {
  const li = document.createElement('li');
  li.className = 'file-card';
  li.dataset.id = item.id;

  const meta = document.createElement('div');
  meta.className = 'file-meta';

  const name = document.createElement('div');
  name.className = 'file-name';
  name.textContent = item.uniqueName;

  const size = document.createElement('div');
  size.className = 'file-size';
  size.textContent = `${formatBytes(item.file.size)} • ${item.file.name}`;

  meta.appendChild(name);
  meta.appendChild(size);

  const progressWrap = document.createElement('div');
  progressWrap.className = 'progress-wrap';

  const progress = document.createElement('div');
  progress.className = 'progress';
  const bar = document.createElement('i');
  bar.style.width = '0%';
  progress.appendChild(bar);

  const status = document.createElement('div');
  status.className = 'file-status';
  status.textContent = 'Wachtend';

  progressWrap.appendChild(progress);
  progressWrap.appendChild(status);

  // Retry button (verborgen tot nodig)
  const retryBtn = document.createElement('button');
  retryBtn.className = 'small-button';
  retryBtn.textContent = 'Opnieuw proberen';
  retryBtn.style.display = 'none';
  retryBtn.addEventListener('click', () => {
    // Haal item en zet opnieuw in queue via uploadController
    retryBtn.disabled = true;
    status.textContent = 'Opnieuw proberen...';
    const entry = fileItems.get(item.id);
    if (entry) {
      // Zorg dat we hergebruiken dezelfde unieke naam
      uploadController.addFiles([{ file: entry.item.file, uniqueName: entry.item.uniqueName }], createCallbacksForItem(entry.item));
    }
  });

  progressWrap.appendChild(retryBtn);

  li.appendChild(meta);
  li.appendChild(progressWrap);

  // Save DOM references
  fileItems.set(item.id, {
    item,
    dom: {li, name, size, bar, status, retryBtn}
  });

  return li;
}

function updateFileProgress(item, uploaded, total) {
  const entry = fileItems.get(item.id);
  if (!entry) return;
  const pct = Math.round((uploaded / total) * 100);
  entry.dom.bar.style.width = pct + '%';
  entry.dom.status.textContent = `${pct}% • ${formatBytes(uploaded)} van ${formatBytes(total)}`;
}

function setFileStatusDone(item) {
  const entry = fileItems.get(item.id);
  if (!entry) return;
  entry.dom.status.textContent = 'Klaar';
  entry.dom.retryBtn.style.display = 'none';
}

function setFileStatusFailed(item, message) {
  const entry = fileItems.get(item.id);
  if (!entry) return;
  entry.dom.status.textContent = message || 'Mislukt';
  entry.dom.retryBtn.style.display = 'inline';
  entry.dom.retryBtn.disabled = false;
}

/* ===== Overall progress ===== */
function refreshOverallProgress() {
  const totalFiles = fileItems.size;
  if (totalFiles === 0) {
    overallProgress.textContent = '';
    return;
  }
  let doneCount = 0;
  fileItems.forEach(({item, dom}) => {
    const width = parseFloat(dom.bar.style.width) || 0;
    if (width >= 100) doneCount++;
  });
  overallProgress.textContent = `${doneCount} van ${totalFiles} bestanden klaar`;
}

/* ===== Callbacks voor uploadController ===== */
function createCallbacksForItem(item) {
  return {
    onFileStart: (it) => {
      // Zorg dat DOM er is
      if (!fileItems.has(it.id)) {
        const li = createFileCard(it);
        filesList.appendChild(li);
      }
      uploadingCount++;
      warningBox.hidden = false;
      requestWakeLock();
      setBeforeUnload(true);
      refreshOverallProgress();
    },
    onFileProgress: (it, uploaded, total) => {
      updateFileProgress(it, uploaded, total);
      refreshOverallProgress();
    },
    onFileDone: (it) => {
      setFileStatusDone(it);
      uploadingCount = Math.max(0, uploadingCount - 1);
      refreshOverallProgress();
      if (uploadingCount === 0) {
        // Alle uploads klaar
        warningBox.hidden = true;
        thanksBox.hidden = false;
        releaseWakeLock();
        setBeforeUnload(false);
      }
    },
    onFileFailed: (it, err) => {
      setFileStatusFailed(it, 'Je verbinding viel weg, we proberen het opnieuw...');
      uploadingCount = Math.max(0, uploadingCount - 1);
      refreshOverallProgress();
      // Laat de gebruiker handmatig herstarten via knop
      warningBox.hidden = uploadingCount === 0;
      if (uploadingCount === 0) {
        releaseWakeLock();
        setBeforeUnload(false);
      }
    },
    onOverallProgress: () => {
      refreshOverallProgress();
    }
  };
}

/* ===== Bestandsselectie & drag & drop ===== */
function handleFilesSelected(fileList) {
  const guestName = guestNameInput && guestNameInput.value ? guestNameInput.value.trim() : '';
  const filesArray = Array.from(fileList);
  const items = filesArray.map(f => ({ file: f, uniqueName: makeUniqueFilename(f.name, guestName), id: Math.random().toString(36).slice(2,9)}));

  // Maak DOM kaarten en voeg toe aan uploadController met originele File objects
  items.forEach(it => {
    const domItem = { file: it.file, uniqueName: it.uniqueName, id: it.id };
    const li = createFileCard(domItem);
    filesList.appendChild(li);
    // Gebruik uploadController to add actual File, geef dezelfde uniqueName zodat Drive bestandsnaam consistent blijft
    uploadController.addFiles([{ file: it.file, uniqueName: it.uniqueName }], createCallbacksForItem({ ...domItem, file: it.file }));
  });

  // UI: show warning
  if (items.length > 0) {
    warningBox.hidden = false;
    thanksBox.hidden = true;
  }
}

/* Button to open file picker */
chooseFilesButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  const f = e.target.files;
  if (f && f.length) handleFilesSelected(f);
  // Reset input so same files can be selected again
  fileInput.value = '';
});

/* Drag & drop */
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
    handleFilesSelected(e.dataTransfer.files);
  }
});

/* Add more knop (na voltooiing) */
addMoreButton.addEventListener('click', () => {
  thanksBox.hidden = true;
  fileInput.click();
});

/* Initial accessibility: focus ring for keyboard users */
document.body.addEventListener('keyup', (e) => {
  if (e.key === 'Tab') {
    document.body.classList.add('show-focus');
  }
});

/* ===== Internationalized (Nederlands) error strings in UI handled above ===== */

/* No extraneous exports; script initialisatie klaar */
