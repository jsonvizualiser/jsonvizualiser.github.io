# FHIR JSON Visualizer

A powerful, client-side JSON visualizer designed for FHIR bundles with sharing capabilities. Built with pure HTML, CSS, and JavaScript - no frameworks required.

## Features

- **Dual View Mode**: View your JSON in both formatted code view and collapsible tree view simultaneously
- **Syntax Highlighting**: Color-coded JSON for better readability
- **Edit Mode**: Edit JSON directly in the code view
- **Shareable Links**: Generate compressed URLs to share your JSON with others
- **Load from URL**: Fetch JSON from external URLs
- **Paste Support**: Paste JSON directly into the textarea
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **No Backend Required**: Everything runs in your browser

## Usage

### Loading JSON

1. **Paste JSON**: Copy your FHIR bundle or any JSON and paste it into the textarea
2. **Load from URL**: Enter a URL that returns JSON and click "Load from URL"
3. **From Shared Link**: Open a shared link that contains compressed JSON in the URL

### Visualizing

Click the **"Visualize"** button to render your JSON in both code and tree views.

### Editing

1. Enable **"Edit Mode"** checkbox
2. Click into the code editor and make your changes
3. Disable edit mode to re-parse and update the visualization

### Sharing

1. Click the **"Share Link"** button
2. The compressed URL will be copied to your clipboard
3. Share this URL with others - they'll see the same JSON

### View Controls

- **Code View**: Toggle the syntax-highlighted code editor
- **Tree View**: Toggle the collapsible tree structure
- **Format**: Re-format the code for better readability
- **Copy**: Copy the current JSON to clipboard

## Technology Stack

- **HTML5**: Semantic markup
- **CSS3**: Modern responsive design with CSS Grid and Flexbox
- **Vanilla JavaScript**: No frameworks - pure ES6+
- **LZ-String**: Compression library for shareable URLs

## Deployment

### GitHub Pages

1. Push this repository to GitHub
2. Go to repository Settings > Pages
3. Set source to main branch
4. Your visualizer will be available at `https://yourusername.github.io/repository-name/`

### Local Development

Simply open `index.html` in your browser. No build step required.

## URL Compression

The visualizer uses LZ-String compression algorithm to create shareable URLs. Even large FHIR bundles (50KB+) can be compressed to manageable URL sizes.

Example:
```
Original JSON: ~10KB
Compressed URL: ~2KB (in hash)
```

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Use Cases

- **FHIR Bundle Inspection**: Visualize complex FHIR resources
- **API Testing**: View and share API responses
- **Data Debugging**: Inspect nested JSON structures
- **Collaboration**: Share JSON data via links without file transfers
- **JSON Education**: Teach JSON structure with tree view

## License

MIT License - Feel free to use and modify

## Contributing

Contributions welcome! This is a simple single-page application with three main files:
- `index.html` - Structure
- `styles.css` - Styling
- `app.js` - Functionality

---

Built with HTML, CSS, and JavaScript
