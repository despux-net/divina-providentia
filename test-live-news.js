// Native fetch available in Node.js 18+
async function testFetchLiveNews() {
    const url = 'https://nzwtafacdpdgulzcwntx.supabase.co/functions/v1/fetch-live-news';
    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56d3RhZmFjZHBkZ3VsemN3bnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MjkxNDksImV4cCI6MjA4MTQwNTE0OX0.6elrAvcsEAc0Jaj4P8-ZFLSWKi2cvzgoAYGlDxeR-8U'; // From supabase-config.js

    try {
        console.log(`Pinging ${url}...`);
        const res = await globalThis.fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${anonKey}`
            }
        });

        console.log(`Status: ${res.status}`);
        const text = await res.text();
        console.log(`Body: ${text}`);

    } catch (err) {
        console.error('Error:', err);
    }
}

testFetchLiveNews();
