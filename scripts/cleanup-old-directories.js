#!/usr/bin/env node

// Script to delete old directories from R2 bucket
// This will delete any remaining files in the old directory structure

const https = require('https');
const fs = require('fs');
const path = require('path');

console.log('🗑️  R2 Directory Cleanup Script');
console.log('===============================');
console.log('');

const ACCOUNT_ID = '3daae940fcb6fc5b8bbd9bb8fcc62854';
const BUCKET_NAME = 'little-hero-assets';

function getWranglerToken() {
    const macPath = path.join(process.env.HOME, 'Library', 'Preferences', '.wrangler', 'config', 'default.toml');
    const config = fs.readFileSync(macPath, 'utf8');
    const tokenMatch = config.match(/oauth_token = "([^"]+)"/);
    return tokenMatch ? tokenMatch[1] : null;
}

function makeRequest(options) {
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
        req.end();
    });
}

async function listObjects(prefix) {
    const token = getWranglerToken();
    if (!token) {
        throw new Error('Could not get wrangler token');
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
        throw new Error(`API request failed: ${result.status}`);
    }
}

async function deleteObject(key) {
    const token = getWranglerToken();
    if (!token) {
        throw new Error('Could not get wrangler token');
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

async function cleanupDirectory(prefix) {
    console.log(`🗑️  Cleaning up ${prefix}...`);
    
    try {
        const objects = await listObjects(prefix);
        
        if (objects.length === 0) {
            console.log(`  ✅ No files found in ${prefix} (already clean)`);
            return;
        }
        
        console.log(`  📊 Found ${objects.length} files to delete`);
        
        for (const obj of objects) {
            console.log(`  🗑️  Deleting: ${obj.key}`);
            const success = await deleteObject(obj.key);
            if (success) {
                console.log(`    ✅ Deleted: ${obj.key}`);
            } else {
                console.log(`    ❌ Failed to delete: ${obj.key}`);
            }
        }
        
        console.log(`  ✅ Completed cleanup of ${prefix}`);
    } catch (error) {
        console.log(`  ❌ Error cleaning ${prefix}: ${error.message}`);
    }
}

async function main() {
    try {
        console.log('🔍 Checking for files in old directories...');
        
        // Clean up old directory structure
        await cleanupDirectory('fonts/');
        await cleanupDirectory('overlays/');
        await cleanupDirectory('characters/');
        
        console.log('');
        console.log('✅ Cleanup complete!');
        console.log('');
        console.log('📝 Note: Empty directories will automatically disappear from the dashboard');
        console.log('   once all files are deleted from them.');
        
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        process.exit(1);
    }
}

main();
