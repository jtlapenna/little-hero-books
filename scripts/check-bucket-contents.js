#!/usr/bin/env node

// Simple script to check what files exist in the R2 bucket

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

async function checkBucketContents() {
    const token = getWranglerToken();
    if (!token) {
        console.log('❌ Could not get wrangler token');
        return;
    }
    
    console.log('🔍 Checking bucket contents...');
    
    // Check different prefixes
    const prefixes = [
        '',
        'fonts/',
        'overlays/',
        'characters/',
        'book-mvp-simple-adventure/',
        'book-mvp-simple-adventure/fonts/',
        'book-mvp-simple-adventure/overlays/',
        'book-mvp-simple-adventure/order-generated-assets/',
        'book-mvp-simple-adventure/order-generated-assets/characters/'
    ];
    
    for (const prefix of prefixes) {
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
        
        try {
            const result = await makeRequest(options);
            if (result.status === 200) {
                const objects = result.data.objects || [];
                if (objects.length > 0) {
                    console.log(`\n📁 ${prefix || '(root)'}:`);
                    objects.forEach(obj => {
                        console.log(`  - ${obj.key}`);
                    });
                }
            } else {
                console.log(`❌ Error checking ${prefix}: ${result.status}`);
            }
        } catch (error) {
            console.log(`❌ Error checking ${prefix}: ${error.message}`);
        }
    }
}

checkBucketContents().catch(console.error);
