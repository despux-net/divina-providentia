const https = require('https');

const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56d3RhZmFjZHBkZ3VsemN3bnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MjkxNDksImV4cCI6MjA4MTQwNTE0OX0.6elrAvcsEAc0Jaj4P8-ZFLSWKi2cvzgoAYGlDxeR-8U';
const bookId = '93f26c9d-dd25-426a-a4d0-3db175026960';
const url = `https://nzwtafacdpdgulzcwntx.supabase.co/functions/v1/get-book-preview?id=${bookId}`;

console.log(`Testing Edge Function: ${url}`);

const options = {
    headers: {
        'Authorization': `Bearer ${anonKey}`
    }
};

https.get(url, options, (res) => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', res.headers);

    let data = [];
    res.on('data', (chunk) => {
        data.push(chunk);
    });

    res.on('end', () => {
        const buffer = Buffer.concat(data);
        console.log('Body Length:', buffer.length);
        if (buffer.length > 0) {
            console.log('FULL BODY:', buffer.toString());
        }
    });

}).on('error', (e) => {
    console.error(e);
});
