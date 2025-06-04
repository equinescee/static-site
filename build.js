const fs = require('fs-extra');
const path = require('path');
const { marked } = require('marked');
const matter = require('gray-matter');

// HTML template for wrapping Markdown content
const template = (metadata, content) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${metadata.title || 'Untitled'} - My Website</title>
    <meta name="description" content="${metadata.description || ''}">
    <link rel="stylesheet" href="/css/style.css">
</head>
<body>
    <header>
        <nav>
            <ul>
                <li><a href="/index.html">Home</a></li>
                <li><a href="/blog/index.html">Blog</a></li>
                <li><a href="/about.html">About</a></li>
                <li><a href="/faq.html">FAQ</a></li>
            </ul>
        </nav>
    </header>

    <main>
        <article>
            <header>
                <h1>${metadata.title || 'Untitled'}</h1>
                ${metadata.date ? `<time datetime="${metadata.date}">${new Date(metadata.date).toLocaleDateString()}</time>` : ''}
                ${metadata.author ? `<p class="author">By ${metadata.author}</p>` : ''}
            </header>
            ${content}
        </article>
    </main>

    <footer>
        <p>&copy; 2024 My Website. All rights reserved.</p>
    </footer>

    <script src="/js/main.js"></script>
</body>
</html>
`;

// Process a single markdown file
async function processMarkdown(filePath) {
    const source = await fs.readFile(filePath, 'utf-8');
    const { data, content } = matter(source);
    const html = marked(content);
    
    // If no title in front matter, try to extract from content
    if (!data.title) {
        const firstHeading = content.split('\n').find(line => line.startsWith('# '));
        if (firstHeading) {
            data.title = firstHeading.replace('# ', '').trim();
        }
    }
    
    return template(data, html);
}

// Process all markdown files recursively
async function processDirectory(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
            // Process subdirectories recursively
            await processDirectory(fullPath);
        } else if (entry.name.endsWith('.md')) {
            // Process markdown files
            const content = await processMarkdown(fullPath);
            
            // Calculate output path maintaining directory structure
            const relativePath = path.relative('src/content', fullPath);
            const outputPath = path.join('dist', relativePath.replace('.md', '.html'));
            
            // Ensure output directory exists
            await fs.ensureDir(path.dirname(outputPath));
            
            // Write the file
            await fs.writeFile(outputPath, content);
            console.log(`Processed: ${relativePath}`);
        }
    }
}

// Copy static assets to dist
async function copyStaticAssets() {
    // Copy CSS
    await fs.copy('src/css', 'dist/css');
    // Copy JS
    await fs.copy('src/js', 'dist/js');
    // Copy index.html if it exists in src
    if (await fs.pathExists('src/index.html')) {
        await fs.copy('src/index.html', 'dist/index.html');
    }
}

// Clean dist directory
async function cleanDist() {
    await fs.remove('dist');
    await fs.ensureDir('dist');
}

// Main build function
async function build() {
    try {
        // Clean and create dist directory
        await cleanDist();

        // Create necessary source directories if they don't exist
        await fs.ensureDir('src/content');
        await fs.ensureDir('src/content/blog');
        await fs.ensureDir('src/css');
        await fs.ensureDir('src/js');

        // Process all content
        await processDirectory('src/content');
        
        // Copy static assets
        await copyStaticAssets();

        console.log('Build completed successfully!');
    } catch (error) {
        console.error('Build failed:', error);
    }
}

build(); 