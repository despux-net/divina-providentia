const SUPABASE_URL = 'https://nzwtafacdpdgulzcwntx.supabase.co';
const k1 = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56d3RhZmFjZHBkZ3VsemN3bnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4MjkxNDksImV4cCI6MjA4MTQwNTE0OX0';
const k2 = '.6elrAvcsEAc0Jaj4P8-ZFLSWKi2cvzgoAYGlDxeR-8U';
const SUPABASE_ANON_KEY = k1 + k2;

async function testEdgeFunction() {
    console.log('Testing Edge Function...');
    const bookId = 'sample-book-1';
    const url = `${SUPABASE_URL}/functions/v1/get-book-preview?id=${bookId}`;

    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });

        console.log(`Status: ${response.status} ${response.statusText}`);

        if (response.ok) {
            console.log('✅ Success! PDF data received.');
            const text = await response.text();
            console.log('First 100 chars:', text.substring(0, 100));
            // Check for PDF signature
            if (text.startsWith('%PDF')) {
                console.log('✅ Visual check: Starts with %PDF');
            } else {
                console.log('❌ Warning: Does not start with %PDF');
            }
        } else {
            console.log('❌ Failed.');
            const errorText = await response.text();
            console.log('Error body:', errorText);
        }
    } catch (error) {
        console.error('❌ Network error:', error);
    }
}

testEdgeFunction();
