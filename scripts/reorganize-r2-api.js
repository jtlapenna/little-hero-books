#!/usr/bin/env node

// R2 Bucket Reorganization using Cloudflare API
// This script uses your existing wrangler authentication

const https = require('https');
const fs = require('fs');
const path = require('path');

console.log('🔄 R2 Bucket Reorganization (Cloudflare API)');
console.log('==============================================');
console.log('');

const ACCOUNT_ID = '3daae940fcb6fc5b8bbd9bb8fcc62854';
const BUCKET_NAME = 'little-hero-assets';

console.log('📋 Reorganization Plan:');
console.log('1. Move fonts/ → book-mvp-simple-adventure/fonts/');
console.log('2. Move overlays/ → book-mvp-simple-adventure/overlays/');
console.log('3. Move characters/ → book-mvp-simple-adventure/order-generated-assets/characters/');
console.log('');

// Function to make API requests
function makeRequest(options, postData = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve({ status: res.statusCode, data: result });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });
        
        req.on('error', reject);
        
        if (postData) {
            req.write(postData);
        }
        
        req.end();
    });
}

// Function to get wrangler token
function getWranglerToken() {
    try {
        // Try macOS path first
        const macPath = path.join(process.env.HOME, 'Library', 'Preferences', '.wrangler', 'config', 'default.toml');
        const linuxPath = path.join(process.env.HOME, '.wrangler', 'config', 'default.toml');
        
        const configPath = fs.existsSync(macPath) ? macPath : linuxPath;
        
        if (fs.existsSync(configPath)) {
            const config = fs.readFileSync(configPath, 'utf8');
            const tokenMatch = config.match(/oauth_token = "([^"]+)"/);
            if (tokenMatch) {
                return tokenMatch[1];
            }
        }
    } catch (error) {
        console.log('⚠️  Could not extract token from wrangler config');
    }
    return null;
}

// Function to list objects in a prefix
async function listObjects(prefix) {
    const token = getWranglerToken();
    if (!token) {
        throw new Error('Could not get wrangler token. Please run "wrangler login" first.');
    }
    
    const options = {
        hostname: 'api.cloudflare.com',
        port: 443,
        path: `/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects?prefix=${encodeURIComponent(prefix)}`,
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };
    
    const result = await makeRequest(options);
    if (result.status === 200) {
        return result.data.objects || [];
    } else {
        throw new Error(`API request failed: ${result.status} - ${JSON.stringify(result.data)}`);
    }
}

// Function to copy an object
async function copyObject(sourceKey, destKey) {
    const token = getWranglerToken();
    if (!token) {
        throw new Error('Could not get wrangler token. Please run "wrangler login" first.');
    }
    
    const options = {
        hostname: 'api.cloudflare.com',
        port: 443,
        path: `/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects/${encodeURIComponent(destKey)}`,
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-Copy-Source': `${BUCKET_NAME}/${sourceKey}`
        }
    };
    
    const result = await makeRequest(options);
    return result.status === 200;
}

// Function to delete an object
async function deleteObject(key) {
    const token = getWranglerToken();
    if (!token) {
        throw new Error('Could not get wrangler token. Please run "wrangler login" first.');
    }
    
    const options = {
        hostname: 'api.cloudflare.com',
        port: 443,
        path: `/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects/${encodeURIComponent(key)}`,
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };
    
    const result = await makeRequest(options);
    return result.status === 204;
}

// Function to move directory
async function moveDirectory(sourcePrefix, destPrefix) {
    console.log(`📁 Moving ${sourcePrefix} → ${destPrefix}`);
    
    try {
        const objects = await listObjects(sourcePrefix);
        
        if (objects.length === 0) {
            console.log(`  ⚠️  No files found in ${sourcePrefix}`);
            return;
        }
        
        console.log(`  📊 Found ${objects.length} files to move`);
        
        for (const obj of objects) {
            const sourceKey = obj.key;
            const filename = sourceKey.replace(sourcePrefix + '/', '');
            const destKey = `${destPrefix}/${filename}`;
            
            console.log(`  📄 Copying: ${filename}`);
            
            const success = await copyObject(sourceKey, destKey);
            if (success) {
                console.log(`    ✅ Copied: ${filename}`);
                
                // Delete original
                const deleted = await deleteObject(sourceKey);
                if (deleted) {
                    console.log(`    🗑️  Deleted original: ${filename}`);
                } else {
                    console.log(`    ⚠️  Failed to delete original: ${filename}`);
                }
            } else {
                console.log(`    ❌ Failed to copy: ${filename}`);
            }
        }
        
        console.log(`  ✅ Completed moving ${sourcePrefix}`);
    } catch (error) {
        console.log(`  ❌ Error moving ${sourcePrefix}: ${error.message}`);
    }
}

// Main execution
async function main() {
    try {
        console.log('🔍 Testing connection...');
        const testObjects = await listObjects('');
        console.log('✅ Successfully connected to R2');
        console.log('');
        
        console.log('🚀 Starting reorganization...');
        
        // Move fonts
        await moveDirectory('fonts', 'book-mvp-simple-adventure/fonts');
        
        // Move overlays
        await moveDirectory('overlays', 'book-mvp-simple-adventure/overlays');
        
        // Move characters
        await moveDirectory('characters', 'book-mvp-simple-adventure/order-generated-assets/characters');
        
        console.log('');
        console.log('🔍 Verification:');
        
        // Verify results
        const fonts = await listObjects('book-mvp-simple-adventure/fonts');
        const overlays = await listObjects('book-mvp-simple-adventure/overlays');
        const characters = await listObjects('book-mvp-simple-adventure/order-generated-assets/characters');
        
        console.log(`📊 Fonts: ${fonts.length} files`);
        console.log(`📊 Overlays: ${overlays.length} files`);
        console.log(`📊 Characters: ${characters.length} files`);
        
        console.log('');
        console.log('✅ Reorganization complete!');
        console.log('');
        console.log('🔗 New asset URLs:');
        console.log('• Fonts: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/fonts/');
        console.log('• Overlays: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/overlays/');
        console.log('• Characters: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/order-generated-assets/characters/');
        console.log('• Backgrounds: https://little-hero-assets.r2.cloudflarestorage.com/book-mvp-simple-adventure/backgrounds/');
        
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        process.exit(1);
    }
}

main();
