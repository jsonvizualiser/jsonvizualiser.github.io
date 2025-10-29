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

    // Common FHIR enum/status values (\x40-\x6F)
    '"final"': '\x40', '"active"': '\x41', '"completed"': '\x42', '"confirmed"': '\x43',
    '"provisional"': '\x44', '"male"': '\x45', '"female"': '\x46', '"Present"': '\x47',
    '"Abnormal"': '\x48', '"Imaging"': '\x49', '"Exam"': '\x4A', '"Radiology"': '\x4B',
    '"imaging"': '\x4C', '"exam"': '\x4D', '"order"': '\x4E', '"collection"': '\x4F',
    '"Active"': '\x50', '"Confirmed"': '\x51', '"Provisional"': '\x52', '"years"': '\x53',
    '"Encounter Diagnosis"': '\x54', '"encounter-diagnosis"': '\x55', '"Brother"': '\x56',
    '"Suspected"': '\x57', '"Indeterminate"': '\x58', '"RAD"': '\x59', '"BRO"': '\x5A',
    '"A"': '\x5B', '"IND"': '\x5C',

    // Common medical terms (\x70-\x9F)
    '"Pneumonia"': '\x70', '"Bronchiectasis"': '\x71', '"Chest X-ray"': '\x72',
    '"Cough"': '\x73', '"John Smith"': '\x74', '"Mycoplasma pneumonia"': '\x75',
    '"Mycoplasma pneumoniae pneumonia"': '\x76', '"Community acquired pneumonia"': '\x77',
    '"Hilar lymphadenopathy"': '\x78', '"Opacity of lung field"': '\x79',
    '"Parenchymal opacity"': '\x7A', '"Hilar fullness"': '\x7B',
    '"Left upper lobe of lung"': '\x7C', '"Left hilum of lung"': '\x7D',
    '"Michael Smith (Brother)"': '\x7E',

    // Common URLs (using \xF0-\xFF range)
    '"http://snomed.info/sct"': '\xF1',
    '"http://terminology.hl7.org/CodeSystem/': '\xF2',
    '"http://hl7.org/fhir/': '\xF3',
    '"http://unitsofmeasure.org"': '\xF4',
    '"urn:uuid:': '\xF5',
    '"http://loinc.org"': '\xF6',
    '"http://hospital.example.org/': '\xF7',
    '"http://terminology.hl7.org/CodeSystem/condition-clinical"': '\xF8',
    '"http://terminology.hl7.org/CodeSystem/condition-ver-status"': '\xF9',
    '"http://terminology.hl7.org/CodeSystem/condition-category"': '\xFA',
    '"http://terminology.hl7.org/CodeSystem/observation-category"': '\xFB',
    '"http://terminology.hl7.org/CodeSystem/v2-0074"': '\xFC',
    '"http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation"': '\xFD',
    '"http://terminology.hl7.org/CodeSystem/v3-RoleCode"': '\xFE'
};

// Create reverse dictionary for detokenization
const FHIR_DICT_REVERSE = {};
for (const [key, value] of Object.entries(FHIR_DICT)) {
    FHIR_DICT_REVERSE[value] = key;
}

// Base85 encoding for better URL compression (25% more efficient than base64)
// Using URL-safe character set (85 chars total)
const BASE85_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~!*()$,;=@[]';

function base85Encode(bytes) {
    const result = [];
    let value = 0;
    let count = 0;

    for (let i = 0; i < bytes.length; i++) {
        value = value * 256 + bytes[i];
        count++;

        if (count === 4) {
            // Encode 4 bytes into 5 base85 characters
            const encoded = [];
            for (let j = 0; j < 5; j++) {
                encoded.unshift(BASE85_CHARS[value % 85]);
                value = Math.floor(value / 85);
            }
            result.push(...encoded);
            value = 0;
            count = 0;
        }
    }

    // Handle remaining bytes
    if (count > 0) {
        // Pad with zeros
        for (let j = count; j < 4; j++) {
            value = value * 256;
        }

        const encoded = [];
        for (let j = 0; j < count + 1; j++) {
            encoded.unshift(BASE85_CHARS[value % 85]);
            value = Math.floor(value / 85);
        }
        result.push(...encoded);
    }

    return result.join('');
}

function base85Decode(str) {
    const bytes = [];
    let value = 0;
    let count = 0;

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const charValue = BASE85_CHARS.indexOf(char);

        if (charValue === -1) {
            throw new Error('Invalid Base85 character: ' + char);
        }

        value = value * 85 + charValue;
        count++;

        if (count === 5) {
            // Decode 5 base85 characters into 4 bytes
            for (let j = 3; j >= 0; j--) {
                bytes.push((value >> (j * 8)) & 0xFF);
            }
            value = 0;
            count = 0;
        }
    }

    // Handle remaining characters
    if (count > 0) {
        // Calculate how many bytes we should get
        const numBytes = count - 1;

        // Add implicit zeros
        for (let j = count; j < 5; j++) {
            value = value * 85;
        }

        for (let j = numBytes - 1; j >= 0; j--) {
            bytes.push((value >> (j * 8)) & 0xFF);
        }
    }

    return new Uint8Array(bytes);
}

// UUID/Reference compression
const REF_MARKER = '\uE000'; // Private use area character as reference marker

// Build reference table by scanning object for urn:uuid: strings
function buildReferenceTable(obj, refTable = [], refMap = new Map()) {
    if (obj === null || typeof obj !== 'object') {
        // Check if it's a string starting with urn:uuid:
        if (typeof obj === 'string' && obj.startsWith('urn:uuid:')) {
            if (!refMap.has(obj)) {
                const index = refTable.length;
                refTable.push(obj);
                refMap.set(obj, index);
            }
        }
        return { refTable, refMap };
    }

    if (Array.isArray(obj)) {
        obj.forEach(item => buildReferenceTable(item, refTable, refMap));
        return { refTable, refMap };
    }

    for (const value of Object.values(obj)) {
        buildReferenceTable(value, refTable, refMap);
    }

    return { refTable, refMap };
}

// Compress references: replace urn:uuid: strings with marker + index
function compressReferences(obj, refMap) {
    if (obj === null) {
        return obj;
    }

    if (typeof obj === 'string' && obj.startsWith('urn:uuid:')) {
        const index = refMap.get(obj);
        if (index !== undefined) {
            // Return marker + index byte (supports up to 255 references)
            return REF_MARKER + String.fromCharCode(index);
        }
    }

    if (typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => compressReferences(item, refMap));
    }

    const compressed = {};
    for (const [key, value] of Object.entries(obj)) {
        compressed[key] = compressReferences(value, refMap);
    }

    return compressed;
}

// Decompress references: restore urn:uuid: strings from table
function decompressReferences(obj, refTable) {
    if (obj === null) {
        return obj;
    }

    if (typeof obj === 'string' && obj.startsWith(REF_MARKER)) {
        const index = obj.charCodeAt(1);
        return refTable[index] || obj;
    }

    if (typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => decompressReferences(item, refTable));
    }

    const decompressed = {};
    for (const [key, value] of Object.entries(obj)) {
        decompressed[key] = decompressReferences(value, refTable);
    }

    return decompressed;
}

// Tokenize object (recursively replace common FHIR field names and URLs with tokens)
function tokenizeFHIR(obj) {
    if (obj === null) {
        return obj;
    }

    // Tokenize string values (for URLs and common values)
    if (typeof obj === 'string') {
        const quotedValue = '"' + obj + '"';
        const token = FHIR_DICT[quotedValue];
        return token ? token : obj;
    }

    // Non-object primitives return as-is
    if (typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => tokenizeFHIR(item));
    }

    const tokenized = {};
    for (const [key, value] of Object.entries(obj)) {
        // Check if this key should be tokenized
        const quotedKey = '"' + key + '"';
        const tokenKey = FHIR_DICT[quotedKey] || key;

        // Recursively tokenize the value
        tokenized[tokenKey] = tokenizeFHIR(value);
    }

    return tokenized;
}

// Detokenize object (restore original FHIR field names and URLs)
function detokenizeFHIR(obj) {
    if (obj === null) {
        return obj;
    }

    // Detokenize string values (for URLs and common values)
    if (typeof obj === 'string') {
        const original = FHIR_DICT_REVERSE[obj];
        if (original) {
            // Remove quotes from the original value
            return original.slice(1, -1);
        }
        return obj;
    }

    // Non-object primitives return as-is
    if (typeof obj !== 'object') {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => detokenizeFHIR(item));
    }

    const restored = {};
    for (const [key, value] of Object.entries(obj)) {
        // Check if this key is a token that needs to be restored
        const originalKey = FHIR_DICT_REVERSE[key];
        const restoredKey = originalKey ? originalKey.slice(1, -1) : key; // Remove quotes

        // Recursively detokenize the value
        restored[restoredKey] = detokenizeFHIR(value);
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

            // Try Base85 + CBOR format first (newest - smallest URLs)
            try {
                // Step 1: Decode Base85 to bytes
                const compressed = base85Decode(hash);

                // Step 2: Decompress with fflate
                const decompressedBytes = fflate.unzlibSync(compressed);

                // Step 3: Decode CBOR to payload
                const payload = CBOR.decode(decompressedBytes.buffer);

                // Step 4: Check if it's the new format with refs and data
                let decoded;
                if (payload && typeof payload === 'object' && 'refs' in payload && 'data' in payload) {
                    // New format with UUID reference compression
                    decoded = detokenizeFHIR(payload.data);
                    jsonData = decompressReferences(decoded, payload.refs);
                } else {
                    // Old format without UUID compression
                    jsonData = detokenizeFHIR(payload);
                }
            } catch (e) {
                // Base85 failed, try base64url format (older URLs)
                console.log('Base85 decode failed, trying base64url format');
            }

            // Fallback to base64url + CBOR format
            if (!jsonData) {
                try {
                    // Step 1: Convert base64url back to base64
                    const base64 = hash.replace(/-/g, '+').replace(/_/g, '/');
                    // Add padding if necessary
                    const padded = base64 + '==='.slice((base64.length + 3) % 4);

                    // Step 2: Decode base64 to Uint8Array
                    const compressed = Uint8Array.from(atob(padded), c => c.charCodeAt(0));

                    // Step 3: Decompress with fflate
                    const decompressedBytes = fflate.unzlibSync(compressed);

                    // Step 4: Decode CBOR to payload
                    const payload = CBOR.decode(decompressedBytes.buffer);

                    // Step 5: Check if it's the new format with refs and data
                    let decoded;
                    if (payload && typeof payload === 'object' && 'refs' in payload && 'data' in payload) {
                        // New format with UUID reference compression
                        decoded = detokenizeFHIR(payload.data);
                        jsonData = decompressReferences(decoded, payload.refs);
                    } else {
                        // Old format without UUID compression
                        jsonData = detokenizeFHIR(payload);
                    }
                } catch (e) {
                    // base64url + CBOR format failed too
                    console.log('base64url + CBOR decode failed, trying older formats');
                }
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

        // Step 1: Build reference table for UUID compression
        const { refTable, refMap } = buildReferenceTable(currentJSON);

        // Step 2: Compress UUIDs (replace with marker + index)
        const refCompressed = compressReferences(currentJSON, refMap);

        // Step 3: Tokenize FHIR object (replace common field names/values with short tokens)
        const tokenizedObj = tokenizeFHIR(refCompressed);

        // Step 4: Encode [refTable, tokenizedObj] to CBOR binary format
        const payload = { refs: refTable, data: tokenizedObj };
        const cborData = CBOR.encode(payload);

        // Step 5: Compress with fflate (gzip/zlib)
        const compressed = fflate.zlibSync(new Uint8Array(cborData), { level: 9 });

        // Step 6: Encode with Base85 (more efficient than base64)
        const base85Encoded = base85Encode(compressed);

        const shareURL = window.location.origin + window.location.pathname + '#' + base85Encoded;

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
