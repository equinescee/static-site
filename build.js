const fs = require('fs-extra');
const path = require('path');
const { marked } = require('marked');
const matter = require('gray-matter');

// HTML template for wrapping Markdown content
const template = (metadata, content, relativePath = '.') => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${metadata.title || 'Untitled'} - My Website</title>
    <meta name="description" content="${metadata.description || ''}">
    <link rel="stylesheet" href="${relativePath}/css/style.css">
</head>
<body>
    <header>
        <nav>
            <ul>
                <li><a href="${relativePath}/index.html">Home</a></li>
                <li><a href="${relativePath}/blog/index.html">Blog</a></li>
                <li><a href="${relativePath}/about.html">About</a></li>
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

    <script src="${relativePath}/js/main.js"></script>
</body>
</html>
`;

// Add this at the top with other requires
const blogTemplate = fs.readFileSync('src/templates/blog.html', 'utf-8');

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
    
    // Calculate relative path to root
    const relativePath = path.relative(path.dirname(filePath), 'src/content').replace(/^\.\.\//, '') || '.';
    
    // Use blog template for blog posts, default template for others
    if (filePath.includes('blog/')) {
        return blogTemplate
            .replace('${metadata.title}', data.title || 'Untitled')
            .replace('${metadata.description || \'\'}', data.description || '')
            .replace('${relativePath}', relativePath)
            .replace('${content}', html)
            .replace('${metadata.date ? `<time datetime="${metadata.date}">${new Date(metadata.date).toLocaleDateString()}</time>` : \'\'}',
                data.date ? `<time datetime="${data.date}">${new Date(data.date).toLocaleDateString()}</time>` : '')
            .replace('${metadata.author ? `<span class="author">By ${metadata.author}</span>` : \'\'}',
                data.author ? `<span class="author">By ${data.author}</span>` : '')
            .replace('${metadata.tags ? `<div class="tags">${metadata.tags.map(tag => `<span class="tag">${tag}</span>`).join(\'\')}</div>` : \'\'}',
                data.tags ? `<div class="tags">${data.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>` : '');
    }
    
    return template(data, html, relativePath);
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
    // Only copy if source directories exist
    if (await fs.pathExists('src/css')) {
        await fs.copy('src/css', 'dist/css', { overwrite: true });
    }
    if (await fs.pathExists('src/js')) {
        await fs.copy('src/js', 'dist/js', { overwrite: true });
    }
    if (await fs.pathExists('src/index.html')) {
        await fs.copy('src/index.html', 'dist/index.html', { overwrite: true });
    }
}

// Clean dist directory
async function cleanDist() {
    // Only remove HTML files and keep static assets
    const entries = await fs.readdir('dist', { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join('dist', entry.name);
        if (entry.isFile() && entry.name.endsWith('.html')) {
            await fs.remove(fullPath);
        }
    }
}

// Add this function after processDirectory:
async function generateBlogIndex() {
    const template = await fs.readFile('src/templates/blog-index.html', 'utf-8');
    const blogDir = 'src/content/blog';
    const posts = [];
    
    // Get all blog posts
    const files = await fs.readdir(blogDir);
    for (const file of files) {
        if (file.endsWith('.md')) {
            const content = await fs.readFile(path.join(blogDir, file), 'utf-8');
            const { data } = matter(content);
            posts.push({
                title: data.title,
                date: data.date,
                url: file.replace('.md', '.html')
            });
        }
    }
    
    // Sort posts by date
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Generate HTML for each post
    const postsHtml = posts.map(post => `
        <article class="post-card">
            <div class="post-card-content">
                <h2 class="post-title">
                    <a href="${post.url}">${post.title}</a>
                </h2>
                ${post.date ? `
                    <div class="post-meta">
                        <time datetime="${post.date}">${new Date(post.date).toLocaleDateString()}</time>
                    </div>
                ` : ''}
                ${post.description ? `
                    <p class="post-excerpt">${post.description}</p>
                ` : ''}
                <div class="post-link">
                    <a href="${post.url}" class="read-more">Read More →</a>
                </div>
            </div>
        </article>
    `).join('\n');
    
    // Insert posts into template
    const indexHtml = template.replace('<!-- Blog posts will be inserted here -->', postsHtml);
    
    // Ensure blog directory exists and write the file
    await fs.ensureDir('dist/blog');
    await fs.writeFile('dist/blog/index.html', indexHtml);
}

// Main build function
async function build() {
    try {
        // Ensure dist directory exists
        await fs.ensureDir('dist');
        
        // Clean only HTML files
        await cleanDist();

        // Create necessary source directories if they don't exist
        await fs.ensureDir('src/content');
        await fs.ensureDir('src/content/blog');
        await fs.ensureDir('src/css');
        await fs.ensureDir('src/js');

        // Process all content
        await processDirectory('src/content');
        await generateBlogIndex();
        
        // Copy static assets with overwrite
        await copyStaticAssets();

        console.log('Build completed successfully!');
    } catch (error) {
        console.error('Build failed:', error);
    }
}

build(); 