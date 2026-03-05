const fetch = require('node-fetch');

async function testAuth() {
    const apiKey = "AIzaSyDLDbXD4ac9zJZ3nm6DRFt09W2iMlDczp4";
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: "test_check_api_12345@greenpool.vn",
                password: "password123",
                returnSecureToken: true
            })
        });
        
        const data = await response.json();
        console.log("Response:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Fetch error:", e);
    }
}

testAuth();
