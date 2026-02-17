const https = require('https');

const driveId = '1_Iw7CVF1Nftc0ebqsrzdMUOp_d2Bn5fl';
const initialUrl = `https://drive.google.com/uc?export=download&id=${driveId}`;

function fetchUrl(url) {
    console.log(`Fetching: ${url}`);
    https.get(url, (res) => {
        console.log('Status Code:', res.statusCode);
        console.log('Headers:', res.headers);

        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            console.log('Redirecting to:', res.headers.location);
            fetchUrl(res.headers.location);
            return;
        }

        let data = [];
        res.on('data', (chunk) => {
            data.push(chunk);
        });

        res.on('end', () => {
            const buffer = Buffer.concat(data);
            console.log('Body Length:', buffer.length);
            if (buffer.length > 0) {
                const start = buffer.slice(0, 100).toString();
                // Check for PDF signature
                if (start.includes('%PDF')) {
                    console.log('SUCCESS: PDF Signature found!');
                } else if (start.includes('<!DOCTYPE html>') || start.includes('<html')) {
                    console.log('WARNING: Received HTML instead of PDF. Content preview:', start);
                } else {
                    console.log('Received unknown content type. Start:', start);
                }
            }
        });

    }).on('error', (e) => {
        console.error(e);
    });
}

fetchUrl(initialUrl);
