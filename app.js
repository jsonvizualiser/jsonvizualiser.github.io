// Global state
let currentJSON = null;
let isEditMode = false;

// FHIR Dictionary for tokenization (most common fields and URLs)
const FHIR_DICT = {
    // Top frequency fields (1 byte tokens \x01-\x3F)
    '"resourceType"': '\x01', '"id"': '\x02', '"system"': '\x03', '"code"': '\x04',
    '"coding"': '\x05', '"display"': '\x06', '"reference"': '\x07', '"subject"': '\x08',
    '"status"': '\x09', '"text"': '\x0A', '"fullUrl"': '\x0B', '"resource"': '\x0C',
    '"category"': '\x0D', '"value"': '\x0E', '"url"': '\x0F', '"extension"': '\x10',
    '"given"': '\x11', '"family"': '\x12', '"identifier"': '\x13', '"name"': '\x14',
    '"gender"': '\x15', '"birthDate"': '\x16', '"patient"': '\x17', '"entry"': '\x18',
    '"type"': '\x19', '"timestamp"': '\x1A', '"onsetDateTime"': '\x1B', '"recordedDate"': '\x1C',
    '"effectiveDateTime"': '\x1D', '"valueString"': '\x1E', '"valueCodeableConcept"': '\x1F',
    '"bodySite"': '\x20', '"clinicalStatus"': '\x21', '"verificationStatus"': '\x22',
    '"conclusion"': '\x23', '"conclusionCode"': '\x24', '"note"': '\x25', '"interpretation"': '\x26',
    '"condition"': '\x27', '"intent"': '\x28', '"occurrenceTiming"': '\x29', '"reasonReference"': '\x2A',
    '"evidence"': '\x2B', '"detail"': '\x2C', '"relationship"': '\x2D', '"date"': '\x2E',
    '"valueAge"': '\x2F', '"unit"': '\x30', '"issued"': '\x31', '"result"': '\x32',
    '"onsetAge"': '\x33', '"repeat"': '\x34', '"boundsPeriod"': '\x35', '"authoredOn"': '\x36',
    '"start"': '\x37', '"end"': '\x38', '"Bundle"': '\x39', '"Patient"': '\x3A',
    '"Condition"': '\x3B', '"Observation"': '\x3C', '"DiagnosticReport"': '\x3D',
    '"FamilyMemberHistory"': '\x3E', '"ServiceRequest"': '\x3F',

    // Common URLs (using \xF0-\xFF range)
    '"http://snomed.info/sct"': '\xF1',
    '"http://terminology.hl7.org/CodeSystem/': '\xF2',
    '"http://hl7.org/fhir/': '\xF3',
    '"http://unitsofmeasure.org"': '\xF4',
    '"urn:uuid:': '\xF5',
    '"http://loinc.org"': '\xF6',
    '"http://hospital.example.org/': '\xF7'
};

// Create reverse dictionary for detokenization
const FHIR_DICT_REVERSE = {};
for (const [key, value] of Object.entries(FHIR_DICT)) {
    FHIR_DICT_REVERSE[value] = key;
}

// Tokenize JSON string (replace common FHIR fields with tokens)
function tokenizeFHIR(jsonString) {
    let tokenized = jsonString;

    // Replace each dictionary entry
    for (const [original, token] of Object.entries(FHIR_DICT)) {
        // Use global replacement
        tokenized = tokenized.split(original).join(token);
    }

    return tokenized;
}

// Detokenize (restore original FHIR fields)
function detokenizeFHIR(tokenizedString) {
    let restored = tokenizedString;

    // Replace each token back to original
    for (const [token, original] of Object.entries(FHIR_DICT_REVERSE)) {
        restored = restored.split(token).join(original);
    }

    return restored;
}

// DOM Elements
const elements = {
    jsonInput: document.getElementById('jsonInput'),
    urlInput: document.getElementById('urlInput'),
    loadUrlBtn: document.getElementById('loadUrlBtn'),
    parseBtn: document.getElementById('parseBtn'),
    shareBtn: document.getElementById('shareBtn'),
    clearBtn: document.getElementById('clearBtn'),
    errorMsg: document.getElementById('errorMsg'),
    successMsg: document.getElementById('successMsg'),
    vizSection: document.getElementById('vizSection'),
    codeEditor: document.getElementById('codeEditor'),
    jsonCode: document.getElementById('jsonCode'),
    treeContainer: document.getElementById('treeContainer'),
    showCodeBtn: document.getElementById('showCodeBtn'),
    showTreeBtn: document.getElementById('showTreeBtn'),
    editModeToggle: document.getElementById('editModeToggle'),
    formatCodeBtn: document.getElementById('formatCodeBtn'),
    copyCodeBtn: document.getElementById('copyCodeBtn'),
    codePane: document.getElementById('codePane'),
    treePane: document.getElementById('treePane')
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    loadFromURL();
});

// Event Listeners
function initializeEventListeners() {
    elements.parseBtn.addEventListener('click', handleVisualize);
    elements.shareBtn.addEventListener('click', handleShare);
    elements.clearBtn.addEventListener('click', handleClear);
    elements.loadUrlBtn.addEventListener('click', handleLoadFromURL);
    elements.showCodeBtn.addEventListener('click', () => togglePane('code'));
    elements.showTreeBtn.addEventListener('click', () => togglePane('tree'));
    elements.editModeToggle.addEventListener('change', handleEditModeToggle);
    elements.formatCodeBtn.addEventListener('click', handleFormatCode);
    elements.copyCodeBtn.addEventListener('click', handleCopyCode);

    // Allow Enter key in textarea
    elements.jsonInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            handleVisualize();
        }
    });
}

// Load JSON from URL hash
function loadFromURL() {
    const hash = window.location.hash.substring(1);
    if (hash) {
        try {
            let jsonData = null;
            let decompressed = null;

            // Try CBOR + tokenization format first (newest - smallest URLs)
            try {
                // Step 1: Convert base64url back to base64
                const base64 = hash.replace(/-/g, '+').replace(/_/g, '/');
                // Add padding if necessary
                const padded = base64 + '==='.slice((base64.length + 3) % 4);

                // Step 2: Decode base64 to Uint8Array
                const compressed = Uint8Array.from(atob(padded), c => c.charCodeAt(0));

                // Step 3: Decompress with fflate
                const decompressedBytes = fflate.unzlibSync(compressed);

                // Step 4: Decode CBOR to JSON object
                const cborDecoded = CBOR.decode(decompressedBytes.buffer);

                // Step 5: Convert to JSON string and detokenize
                const tokenizedJSON = JSON.stringify(cborDecoded);
                const detokenized = detokenizeFHIR(tokenizedJSON);

                // Step 6: Parse final JSON
                jsonData = JSON.parse(detokenized);
            } catch (e) {
                // CBOR format failed, try older formats
                console.log('CBOR decode failed, trying fallback formats');
            }

            // Fallback to plain fflate format (without CBOR/tokenization)
            if (!jsonData) {
                try {
                    const base64 = hash.replace(/-/g, '+').replace(/_/g, '/');
                    const padded = base64 + '==='.slice((base64.length + 3) % 4);
                    const compressed = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
                    decompressed = fflate.strFromU8(fflate.unzlibSync(compressed));
                    jsonData = JSON.parse(decompressed);
                } catch (e) {
                    // Plain fflate failed too
                }
            }

            // Fallback to UTF-16 format (middle format)
            if (!jsonData) {
                try {
                    decompressed = LZString.decompressFromUTF16(decodeURIComponent(hash));
                    jsonData = JSON.parse(decompressed);
                } catch (e) {
                    // UTF-16 failed too
                }
            }

            // Fallback to old EncodedURIComponent format (oldest format)
            if (!jsonData) {
                try {
                    decompressed = LZString.decompressFromEncodedURIComponent(hash);
                    jsonData = JSON.parse(decompressed);
                } catch (e) {
                    // All formats failed
                }
            }

            if (jsonData) {
                currentJSON = jsonData;
                elements.jsonInput.value = JSON.stringify(jsonData, null, 2);
                visualizeJSON(jsonData);
                showSuccess('JSON loaded from URL successfully!');
            } else {
                throw new Error('Unable to decode URL - format not recognized');
            }
        } catch (error) {
            showError('Failed to load JSON from URL: ' + error.message);
        }
    }
}

// Handle Visualize button
function handleVisualize() {
    const jsonText = elements.jsonInput.value.trim();

    if (!jsonText) {
        showError('Please enter some JSON to visualize');
        return;
    }

    try {
        const jsonData = JSON.parse(jsonText);
        currentJSON = jsonData;
        visualizeJSON(jsonData);
        hideError();
        hideSuccess();
    } catch (error) {
        showError('Invalid JSON: ' + error.message);
    }
}

// Handle Share button
function handleShare() {
    if (!currentJSON) {
        showError('Please visualize JSON first before sharing');
        return;
    }

    try {
        // If in edit mode, get the latest JSON from code editor
        if (isEditMode) {
            const editedText = elements.codeEditor.textContent;
            currentJSON = JSON.parse(editedText);
        }

        const jsonString = JSON.stringify(currentJSON);

        // Step 1: Tokenize FHIR fields (replace common strings with short tokens)
        const tokenized = tokenizeFHIR(jsonString);

        // Step 2: Parse tokenized JSON and encode to CBOR binary format
        const tokenizedJSON = JSON.parse(tokenized);
        const cborData = CBOR.encode(tokenizedJSON);

        // Step 3: Compress with fflate (gzip/zlib)
        const compressed = fflate.zlibSync(new Uint8Array(cborData), { level: 9 });

        // Step 4: Convert to base64url (URL-safe)
        const base64 = btoa(String.fromCharCode.apply(null, compressed));
        const urlSafe = base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

        const shareURL = window.location.origin + window.location.pathname + '#' + urlSafe;

        // Copy to clipboard
        navigator.clipboard.writeText(shareURL).then(() => {
            showSuccess('Share link copied to clipboard! URL length: ' + shareURL.length + ' characters');

            // Update browser URL without reload
            window.history.pushState(null, '', '#' + compressed);
        }).catch(() => {
            // Fallback for older browsers
            showSuccess('Share URL: ' + shareURL);
        });
    } catch (error) {
        showError('Failed to create share link: ' + error.message);
    }
}

// Handle Clear button
function handleClear() {
    elements.jsonInput.value = '';
    elements.urlInput.value = '';
    currentJSON = null;
    elements.vizSection.classList.add('hidden');
    hideError();
    hideSuccess();
    window.history.pushState(null, '', window.location.pathname);
}

// Handle Load from URL
async function handleLoadFromURL() {
    const url = elements.urlInput.value.trim();

    if (!url) {
        showError('Please enter a URL');
        return;
    }

    try {
        showSuccess('Loading from URL...');
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error('Failed to fetch: ' + response.statusText);
        }

        const jsonData = await response.json();
        currentJSON = jsonData;
        elements.jsonInput.value = JSON.stringify(jsonData, null, 2);
        visualizeJSON(jsonData);
        showSuccess('JSON loaded from URL successfully!');
    } catch (error) {
        showError('Failed to load from URL: ' + error.message);
    }
}

// Visualize JSON in both views
function visualizeJSON(jsonData) {
    // Show visualization section
    elements.vizSection.classList.remove('hidden');

    // Render code view
    renderCodeView(jsonData);

    // Render tree view
    renderTreeView(jsonData);

    // Scroll to visualization
    elements.vizSection.scrollIntoView({ behavior: 'smooth' });
}

// Render Code View with syntax highlighting
function renderCodeView(jsonData) {
    const formatted = JSON.stringify(jsonData, null, 2);
    const highlighted = syntaxHighlight(formatted);
    elements.jsonCode.innerHTML = highlighted;
}

// Syntax highlighting for JSON
function syntaxHighlight(json) {
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
        function (match) {
            let cls = 'json-number';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'json-key';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            }
            return '<span class="' + cls + '">' + match + '</span>';
        });
}

// Render Tree View
function renderTreeView(jsonData) {
    elements.treeContainer.innerHTML = '';
    const rootNode = createTreeNode('root', jsonData, true);
    elements.treeContainer.appendChild(rootNode);
}

// Create tree node recursively
function createTreeNode(key, value, isRoot = false) {
    const nodeDiv = document.createElement('div');
    nodeDiv.className = isRoot ? 'tree-node root' : 'tree-node';

    const itemDiv = document.createElement('div');
    itemDiv.className = 'tree-item';

    const type = typeof value;
    const isObject = type === 'object' && value !== null && !Array.isArray(value);
    const isArray = Array.isArray(value);
    const isExpandable = isObject || isArray;

    // Toggle button for expandable items
    if (isExpandable) {
        const toggle = document.createElement('span');
        toggle.className = 'tree-toggle';
        toggle.textContent = '▼';
        toggle.onclick = function() {
            const children = this.parentElement.nextElementSibling;
            if (children && children.classList.contains('tree-children')) {
                children.classList.toggle('collapsed');
                this.textContent = children.classList.contains('collapsed') ? '▶' : '▼';
            }
        };
        itemDiv.appendChild(toggle);
    } else {
        const spacer = document.createElement('span');
        spacer.style.minWidth = '20px';
        spacer.style.display = 'inline-block';
        itemDiv.appendChild(spacer);
    }

    // Key
    if (!isRoot) {
        const keySpan = document.createElement('span');
        keySpan.className = 'tree-key';
        keySpan.textContent = key + ':';
        itemDiv.appendChild(keySpan);
    }

    // Value or type indicator
    if (isExpandable) {
        const typeSpan = document.createElement('span');
        typeSpan.className = 'tree-type';
        if (isArray) {
            typeSpan.textContent = `Array[${value.length}]`;
        } else {
            typeSpan.textContent = `Object{${Object.keys(value).length}}`;
        }
        itemDiv.appendChild(typeSpan);
    } else {
        const valueSpan = document.createElement('span');
        valueSpan.className = 'tree-value ' + type;

        if (type === 'string') {
            valueSpan.textContent = '"' + value + '"';
        } else if (value === null) {
            valueSpan.className = 'tree-value null';
            valueSpan.textContent = 'null';
        } else {
            valueSpan.textContent = String(value);
        }

        itemDiv.appendChild(valueSpan);
    }

    nodeDiv.appendChild(itemDiv);

    // Children
    if (isExpandable) {
        const childrenDiv = document.createElement('div');
        childrenDiv.className = 'tree-children';

        if (isArray) {
            value.forEach((item, index) => {
                childrenDiv.appendChild(createTreeNode(`[${index}]`, item));
            });
        } else {
            Object.keys(value).forEach(childKey => {
                childrenDiv.appendChild(createTreeNode(childKey, value[childKey]));
            });
        }

        nodeDiv.appendChild(childrenDiv);
    }

    return nodeDiv;
}

// Toggle pane visibility
function togglePane(pane) {
    const dualPane = document.querySelector('.dual-pane');

    if (pane === 'code') {
        const isActive = elements.showCodeBtn.classList.contains('active');
        elements.showCodeBtn.classList.toggle('active');
        elements.codePane.classList.toggle('hidden', isActive);

        updatePaneLayout();
    } else if (pane === 'tree') {
        const isActive = elements.showTreeBtn.classList.contains('active');
        elements.showTreeBtn.classList.toggle('active');
        elements.treePane.classList.toggle('hidden', isActive);

        updatePaneLayout();
    }
}

// Update pane layout based on visibility
function updatePaneLayout() {
    const dualPane = document.querySelector('.dual-pane');
    const codeVisible = elements.showCodeBtn.classList.contains('active');
    const treeVisible = elements.showTreeBtn.classList.contains('active');

    dualPane.classList.remove('code-only', 'tree-only');

    if (codeVisible && !treeVisible) {
        dualPane.classList.add('code-only');
    } else if (!codeVisible && treeVisible) {
        dualPane.classList.add('tree-only');
    }
}

// Handle edit mode toggle
function handleEditModeToggle() {
    isEditMode = elements.editModeToggle.checked;
    elements.codeEditor.contentEditable = isEditMode;

    if (isEditMode) {
        elements.codeEditor.style.cursor = 'text';
        showSuccess('Edit mode enabled. You can now edit the JSON in the code view.');
    } else {
        // Try to parse and update
        try {
            const editedText = elements.codeEditor.textContent;
            const parsed = JSON.parse(editedText);
            currentJSON = parsed;
            visualizeJSON(parsed);
            hideSuccess();
        } catch (error) {
            showError('Invalid JSON in editor: ' + error.message);
        }
    }
}

// Handle format code
function handleFormatCode() {
    if (!currentJSON) return;

    try {
        if (isEditMode) {
            const editedText = elements.codeEditor.textContent;
            currentJSON = JSON.parse(editedText);
        }
        renderCodeView(currentJSON);
        showSuccess('Code formatted successfully!');
        setTimeout(hideSuccess, 2000);
    } catch (error) {
        showError('Cannot format: Invalid JSON');
    }
}

// Handle copy code
function handleCopyCode() {
    const code = elements.codeEditor.textContent;

    navigator.clipboard.writeText(code).then(() => {
        showSuccess('Code copied to clipboard!');
        setTimeout(hideSuccess, 2000);
    }).catch(() => {
        showError('Failed to copy code');
    });
}

// Show error message
function showError(message) {
    elements.errorMsg.textContent = message;
    elements.errorMsg.classList.remove('hidden');
    setTimeout(() => {
        elements.errorMsg.classList.add('hidden');
    }, 5000);
}

// Hide error message
function hideError() {
    elements.errorMsg.classList.add('hidden');
}

// Show success message
function showSuccess(message) {
    elements.successMsg.textContent = message;
    elements.successMsg.classList.remove('hidden');
}

// Hide success message
function hideSuccess() {
    elements.successMsg.classList.add('hidden');
}
