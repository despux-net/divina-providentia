// Auto-Upload Product Images to Supabase
// This script watches the 'product-images' folder and automatically uploads new images

const SUPABASE_URL = 'https://nzwtafacdpdgulzcwntx.supabase.co';
const SUPABASE_SERVICE_KEY = 'YOUR_SERVICE_ROLE_KEY_HERE'; // You'll need to add this

const fs = require('fs');
const path = require('path');
const https = require('https');

const IMAGES_FOLDER = path.join(__dirname, 'product-images');
const PROCESSED_FILE = path.join(__dirname, '.processed-images.json');

// Load processed images history
let processedImages = {};
try {
    if (fs.existsSync(PROCESSED_FILE)) {
        processedImages = JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf8'));
    }
} catch (error) {
    console.error('Error loading processed images:', error);
}

// Save processed images history
function saveProcessedImages() {
    fs.writeFileSync(PROCESSED_FILE, JSON.stringify(processedImages, null, 2));
}

// Upload image to Supabase Storage
async function uploadToSupabase(filePath, fileName) {
    return new Promise((resolve, reject) => {
        const fileBuffer = fs.readFileSync(filePath);
        const fileExt = path.extname(fileName);
        const timestamp = Date.now();
        const storagePath = `${timestamp}${fileExt}`;

        const options = {
            hostname: 'nzwtafacdpdgulzcwntx.supabase.co',
            port: 443,
            path: `/storage/v1/object/products/${storagePath}`,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': getMimeType(fileExt),
                'Content-Length': fileBuffer.length
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200 || res.statusCode === 201) {
                    resolve({
                        path: storagePath,
                        url: `${SUPABASE_URL}/storage/v1/object/public/products/${storagePath}`
                    });
                } else {
                    reject(new Error(`Upload failed: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(fileBuffer);
        req.end();
    });
}

// Create product in Supabase
async function createProduct(imagePath, fileName) {
    return new Promise((resolve, reject) => {
        const productName = path.basename(fileName, path.extname(fileName))
            .replace(/-/g, ' ')
            .replace(/_/g, ' ')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        const productData = {
            name: productName,
            description: 'Producto pendiente de descripción',
            price: 0,
            category: 'vestments', // Default category
            image: imagePath
        };

        const data = JSON.stringify(productData);

        const options = {
            hostname: 'nzwtafacdpdgulzcwntx.supabase.co',
            port: 443,
            path: '/rest/v1/products',
            method: 'POST',
            headers: {
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => responseData += chunk);
            res.on('end', () => {
                if (res.statusCode === 201) {
                    resolve(JSON.parse(responseData)[0]);
                } else {
                    reject(new Error(`Product creation failed: ${res.statusCode} - ${responseData}`));
                }
            });
        });

        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// Get MIME type from extension
function getMimeType(ext) {
    const types = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
    };
    return types[ext.toLowerCase()] || 'application/octet-stream';
}

// Process a new image
async function processImage(fileName) {
    const filePath = path.join(IMAGES_FOLDER, fileName);

    console.log(`\n📸 Processing: ${fileName}`);

    try {
        // Upload to Supabase Storage
        console.log('   ⬆️  Uploading to Supabase Storage...');
        const { path: storagePath, url } = await uploadToSupabase(filePath, fileName);
        console.log('   ✅ Uploaded to:', url);

        // Create product in database
        console.log('   📦 Creating product in database...');
        const product = await createProduct(storagePath, fileName);
        console.log('   ✅ Product created with ID:', product.id);
        console.log('   💡 Edit details at: https://supabase.com/dashboard/project/nzwtafacdpdgulzcwntx/editor');

        // Mark as processed
        processedImages[fileName] = {
            processedAt: new Date().toISOString(),
            productId: product.id,
            storagePath,
            url
        };
        saveProcessedImages();

        console.log(`   🎉 Success! Product "${product.name}" ready for editing\n`);
    } catch (error) {
        console.error(`   ❌ Error processing ${fileName}:`, error.message);
    }
}

// Watch folder for new images
function watchFolder() {
    console.log('👀 Watching folder:', IMAGES_FOLDER);
    console.log('📝 Supported formats: .jpg, .jpeg, .png, .gif, .webp\n');

    // Create folder if it doesn't exist
    if (!fs.existsSync(IMAGES_FOLDER)) {
        fs.mkdirSync(IMAGES_FOLDER);
        console.log('✅ Created product-images folder\n');
    }

    // Process existing images
    const existingFiles = fs.readdirSync(IMAGES_FOLDER);
    const imageFiles = existingFiles.filter(file =>
        /\.(jpg|jpeg|png|gif|webp)$/i.test(file) && !processedImages[file]
    );

    if (imageFiles.length > 0) {
        console.log(`📂 Found ${imageFiles.length} unprocessed image(s)\n`);
        imageFiles.forEach(processImage);
    }

    // Watch for new files
    fs.watch(IMAGES_FOLDER, (eventType, fileName) => {
        if (eventType === 'rename' && fileName && /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)) {
            const filePath = path.join(IMAGES_FOLDER, fileName);

            // Check if file exists (added, not deleted) and not already processed
            if (fs.existsSync(filePath) && !processedImages[fileName]) {
                // Wait a bit to ensure file is fully written
                setTimeout(() => {
                    if (fs.existsSync(filePath)) {
                        processImage(fileName);
                    }
                }, 1000);
            }
        }
    });

    console.log('✨ Ready! Drop images in the product-images folder to auto-upload\n');
}

// Start watching
watchFolder();
