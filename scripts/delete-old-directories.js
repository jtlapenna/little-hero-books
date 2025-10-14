#!/usr/bin/env node

// Direct R2 deletion script for old directories
const https = require('https');
const fs = require('fs');
const path = require('path');

const ACCOUNT_ID = '3daae940fcb6fc5b8bbd9bb8fcc62854';
const BUCKET_NAME = 'little-hero-assets';

function getWranglerToken() {
    const macPath = path.join(process.env.HOME, 'Library', 'Preferences', '.wrangler', 'config', 'default.toml');
    const config = fs.readFileSync(macPath, 'utf8');
    const tokenMatch = config.match(/oauth_token = "([^"]+)"/);
    return tokenMatch ? tokenMatch[1] : null;
}

function deleteObject(key) {
    return new Promise((resolve, reject) => {
        const token = getWranglerToken();
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
        
        const req = https.request(options, (res) => {
            resolve(res.statusCode === 204);
        });
        req.on('error', reject);
        req.end();
    });
}

async function deleteDirectory(prefix) {
    console.log(`🗑️  Deleting directory: ${prefix}`);
    
    const token = getWranglerToken();
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
    
    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', async () => {
            try {
                const result = JSON.parse(data);
                const objects = result.objects || [];
                
                if (objects.length === 0) {
                    console.log(`  ✅ Directory ${prefix} is already empty`);
                    return;
                }
                
                console.log(`  📊 Found ${objects.length} files to delete`);
                
                for (const obj of objects) {
                    console.log(`  🗑️  Deleting: ${obj.key}`);
                    const success = await deleteObject(obj.key);
                    if (success) {
                        console.log(`    ✅ Deleted: ${obj.key}`);
                    } else {
                        console.log(`    ❌ Failed: ${obj.key}`);
                    }
                }
                
                console.log(`  ✅ Completed deletion of ${prefix}`);
            } catch (error) {
                console.log(`  ❌ Error: ${error.message}`);
            }
        });
    });
    
    req.on('error', (error) => {
        console.log(`  ❌ Request error: ${error.message}`);
    });
    
    req.end();
}

async function main() {
    console.log('🗑️  R2 Directory Deletion Script');
    console.log('==================================');
    console.log('');
    
    try {
        await deleteDirectory('fonts/');
        await deleteDirectory('overlays/');
        await deleteDirectory('characters/');
        
        console.log('');
        console.log('✅ All old directories deleted!');
        
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
    }
}

main();
