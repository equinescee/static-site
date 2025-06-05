const fs = require('fs-extra');
const path = require('path');
const { marked } = require('marked');
const matter = require('gray-matter');

// Add this near the top of build.js with other requires
const partials = {};

// Add this at the top with other constants
const BASE_URL = '/static-site';
const GITHUB_PAGES_URL = 'https://equinescee.github.io/static-site';

// Helper function to process template variables
function processTemplateVariables(content) {
    return content
        .replace(/\$\{BASE_URL\}/g, BASE_URL)
        .replace(/href="\/static-site\//g, `href="${GITHUB_PAGES_URL}/`);
}

// Add this function to load partials
async function loadPartials() {
    const partialsDir = 'src/templates/partials';
    if (await fs.pathExists(partialsDir)) {
        const files = await fs.readdir(partialsDir);
        for (const file of files) {
            if (file.endsWith('.html')) {
                const name = path.basename(file, '.html');
                const content = await fs.readFile(path.join(partialsDir, file), 'utf-8');
                partials[name] = content;
            }
        }
    }
}

// Add this helper function
function includePartial(name, data = {}) {
    if (!partials[name]) {
        console.warn(`Warning: Partial '${name}' not found`);
        return '';
    }
    let content = partials[name];
    // Replace variables in the partial
    Object.entries(data).forEach(([key, value]) => {
        content = content.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
    });
    return content;
}

// HTML template for wrapping Markdown content
const template = (metadata, content, relativePath = '.') => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${metadata.title || 'Untitled'} - CompanyName</title>
    <meta name="description" content="${metadata.description || ''}">
    <link rel="stylesheet" href="${BASE_URL}/css/style.css">
</head>
<body>
    ${includePartial('header')}
    
    <main>
        <article>
            <header>
                <h1>${metadata.title || 'Untitled'}</h1>
                ${metadata.date ? `<time datetime="${metadata.date}">${new Date(metadata.date).toLocaleDateString()}</time>` : ''}
                ${metadata.author ? `<p class="author">By ${metadata.author}</p>` : ''}
            </header>
            ${content}
            ${includePartial('convertkit')}
            ${metadata.url ? includePartial('social-share', { url: metadata.url, title: metadata.title }) : ''}
        </article>
    </main>

    ${includePartial('footer')}
</body>
</html>`;

// Add this at the top with other requires
const blogTemplate = fs.readFileSync('src/templates/blog.html', 'utf-8');

// Process a single markdown file
async function processMarkdown(filePath) {
    const source = await fs.readFile(filePath, 'utf-8');
    const { data, content } = matter(source);
    
    // Configure marked for proper heading rendering
    marked.setOptions({
        headerIds: true,
        gfm: true
    });
    
    const html = marked(content);
    
    // Calculate relative path to root
    const relativePath = path.relative(path.dirname(filePath), 'src').replace(/^\.\.\//, '') || '.';
    
    // Use blog template for blog posts, default template for others
    if (filePath.includes('blog/')) {
        let blogContent = blogTemplate;
        
        // Format the date and author
        const formattedDate = data.date ? new Date(data.date).toLocaleDateString() : '';
        const formattedAuthor = data.author ? `<span class="author">By ${data.author}</span>` : '';
        
        // Replace all metadata variables
        const metadata = {
            ...data,
            url: `${BASE_URL}/blog/${path.basename(filePath).replace('.md', '.html')}`,
            relativePath: BASE_URL
        };
        
        // First replace complex date and author template strings
        blogContent = blogContent
            .replace(
                '${metadata.date ? `<time datetime="${metadata.date}">${new Date(metadata.date).toLocaleDateString()}</time>` : \'\'}',
                formattedDate ? `<time datetime="${data.date}">${formattedDate}</time>` : ''
            )
            .replace(
                '${metadata.author ? `<span class="author">By ${metadata.author}</span>` : \'\'}',
                formattedAuthor
            );
        
        // Then replace tags template string
        blogContent = blogContent.replace(
            '${metadata.tags ? `<div class="tags">${metadata.tags.map(tag => `<span class="tag">${tag}</span>`).join(\'\')}</div>` : \'\'}',
            metadata.tags ? `<div class="tags">${metadata.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>` : ''
        );
        
        // Then replace other metadata fields
        blogContent = blogContent
            .replace(/\$\{metadata\.([^}]+)\}/g, (match, key) => {
                const value = key.split('.').reduce((obj, k) => obj && obj[k], metadata);
                return value || '';
            })
            .replace(/\$\{relativePath\}/g, BASE_URL)
            .replace(/\$\{content\}/g, html)
            .replace(/\$\{include\('([^']+)'\)}/g, (match, partialName) => {
                return includePartial(partialName.replace('.html', ''), metadata);
            });
            
        return blogContent;
    } else {
        // For regular pages like about
        const metadata = {
            ...data,
            url: `${BASE_URL}/${path.basename(filePath).replace('.md', '.html')}`,
            relativePath: BASE_URL + '/' + relativePath
        };
        
        // Modified template for about page with proper article structure
        const pageTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${metadata.title || 'Untitled'} - CompanyName</title>
    <meta name="description" content="${metadata.description || ''}">
    <link rel="stylesheet" href="${BASE_URL}/css/style.css">
</head>
<body>
    ${includePartial('header')}
    
    <main class="about-page">
        <article class="about-content">
            <h1>${metadata.title || 'Untitled'}</h1>
            <div class="about-body">
                ${html}
            </div>
            <div class="signup-section-wrapper">
                ${includePartial('convertkit')}
            </div>
        </article>
    </main>

    ${includePartial('footer')}
</body>
</html>`;
        
        return pageTemplate;
    }
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
            
            // Special handling for about.md
            const outputPath = fullPath.includes('about.md') 
                ? path.join('dist', 'about.html')  // Put about.html directly in dist
                : path.join('dist', path.relative('src/content', fullPath).replace('.md', '.html'));
            
            // Ensure output directory exists
            await fs.ensureDir(path.dirname(outputPath));
            
            // Write the file
            await fs.writeFile(outputPath, content);
            console.log(`Processed: ${path.relative('src/content', fullPath)}`);
        }
    }
}

// Copy static assets to dist
async function copyStaticAssets() {
    await fs.ensureDir('dist');
    
    if (await fs.pathExists('src/index.html')) {
        let indexContent = await fs.readFile('src/index.html', 'utf-8');
        indexContent = indexContent.replace(/\$\{BASE_URL\}/g, BASE_URL);
        await fs.writeFile('dist/index.html', indexContent);
    }
    
    if (await fs.pathExists('src/css')) {
        await fs.ensureDir('dist/css');
        await fs.copy('src/css', 'dist/css');
    }
    
    if (await fs.pathExists('src/js')) {
        await fs.ensureDir('dist/js');
        await fs.copy('src/js', 'dist/js');
    }
}

// Clean dist directory
async function cleanDist() {
    // Create dist directory if it doesn't exist
    await fs.ensureDir('dist');
    
    // Only try to remove files that exist
    if (await fs.pathExists('dist')) {
        const entries = await fs.readdir('dist', { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join('dist', entry.name);
            if (entry.isFile() && entry.name.endsWith('.html')) {
                await fs.remove(fullPath);
            }
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
                description: data.description,
                url: `${BASE_URL}/blog/${file.replace('.md', '.html')}`
            });
        }
    }
    
    // Sort posts by date
    posts.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Generate HTML for each post
    const postsHtml = posts.map(post => `
        <article class="post-card">
            <a href="${post.url}" class="post-card-link">
                <div class="post-card-content">
                    <h2 class="post-title">${post.title}</h2>
                    ${post.date ? `
                        <div class="post-meta">
                            <time datetime="${post.date}">${new Date(post.date).toLocaleDateString()}</time>
                        </div>
                    ` : ''}
                    ${post.description ? `
                        <p class="post-excerpt">${post.description}</p>
                    ` : ''}
                    <div class="post-link">
                        <span class="read-more">Read More →</span>
                    </div>
                </div>
            </a>
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
        // Load partials first
        await loadPartials();
        
        // Then proceed with the rest of the build
        await cleanDist();
        await copyStaticAssets();
        await processDirectory('src/content');
        await generateBlogIndex();
        console.log('Build completed successfully!');
    } catch (error) {
        console.error('Build failed:', error);
        throw error;
    }
}

// Start the build
build(); 