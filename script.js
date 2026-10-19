const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbz4wp3yfyZviB9iyprMq2-c__1m9ssV1WVBc5D6HX6B5pB7HdjkPsa0aJ3DmMfVdB6Z2A/exec";

const uploadForm = document.getElementById('uploadForm');
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const fileList = document.getElementById('fileList');
const submitBtn = document.getElementById('submitBtn');
const uploaderName = document.getElementById('uploaderName');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const successMessage = document.getElementById('successMessage');
const resetBtn = document.getElementById('resetBtn');

let selectedFiles = [];

fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
    }
});

function handleFiles(files) {
    for (let file of files) {
        selectedFiles.push(file);
    }
    updateFileListUI();
}

function updateFileListUI() {
    if (selectedFiles.length > 0) {
        fileList.innerHTML = '';
        selectedFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'file-item';
            
            const fileNameSpan = document.createElement('span');
            fileNameSpan.textContent = file.name;
            
            const removeBtn = document.createElement('span');
            removeBtn.textContent = ' ✕';
            removeBtn.style.cursor = 'pointer';
            removeBtn.style.color = '#B25A42';
            removeBtn.style.fontWeight = 'bold';
            removeBtn.onclick = () => removeFile(index);
            
            item.appendChild(fileNameSpan);
            item.appendChild(removeBtn);
            fileList.appendChild(item);
        });
        fileList.classList.remove('hidden');
        submitBtn.disabled = false;
    } else {
        fileList.classList.add('hidden');
        submitBtn.disabled = true;
    }
}

window.removeFile = function(index) {
    selectedFiles.splice(index, 1);
    updateFileListUI();
};

uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0) return;

    uploadForm.style.display = 'none';
    loadingOverlay.classList.remove('hidden');

    const name = uploaderName.value.trim() || "Gast";

    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        loadingText.textContent = `Bezig met uploaden... (${i + 1}/${selectedFiles.length})`;

        try {
            const base64Data = await toBase64(file);
            const payload = {
                name: name,
                filename: file.name,
                mimeType: file.type || 'application/octet-stream',
                fileData: base64Data
            };

            await fetch(SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
        } catch (err) {
            console.error("Fout bij uploaden van:", file.name, err);
        }
    }

    loadingOverlay.classList.add('hidden');
    successMessage.classList.remove('hidden');
});

function toBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });
}

resetBtn.addEventListener('click', () => {
    selectedFiles = [];
    fileInput.value = '';
    uploaderName.value = '';
    fileList.innerHTML = '';
    fileList.classList.add('hidden');
    successMessage.classList.add('hidden');
    uploadForm.style.display = 'block';
    submitBtn.disabled = true;
});