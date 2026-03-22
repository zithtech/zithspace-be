import axios from 'axios';

async function test() {
    try {
        const response = await axios.get('http://localhost:5000/api/recruitment-client/select', {
            headers: {
                'X-Tenant-ID': 'test-tenant-id', // I need a real tenant ID here
                'Authorization': 'Bearer test-token' // And a real token
            }
        });
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error: any) {
        console.error('Error:', error.response?.data || error.message);
    }
}

// test();
