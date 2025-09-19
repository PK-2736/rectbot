// CloudflareAPIトークンの権限をチェック
const fs = require('fs');

async function checkToken() {
    const CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
    
    if (!CLOUDFLARE_API_TOKEN) {
        console.error('CLOUDFLARE_API_TOKEN環境変数が設定されていません');
        return;
    }

    console.log('APIトークンをテスト中...');
    
    try {
        // 1. ユーザー詳細チェック
        const userResponse = await fetch('https://api.cloudflare.com/client/v4/user', {
            headers: {
                'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
        });
        
        const userData = await userResponse.json();
        
        if (userData.success) {
            console.log('✓ ユーザー認証成功:', userData.result.email);
        } else {
            console.log('✗ ユーザー認証失敗:', userData.errors);
        }
        
        // 2. アカウント一覧チェック
        const accountsResponse = await fetch('https://api.cloudflare.com/client/v4/accounts', {
            headers: {
                'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
        });
        
        const accountsData = await accountsResponse.json();
        
        if (accountsData.success) {
            console.log('✓ アカウント取得成功:');
            accountsData.result.forEach(account => {
                console.log(`  - ${account.name} (${account.id})`);
            });
        } else {
            console.log('✗ アカウント取得失敗:', accountsData.errors);
        }
        
        // 3. Pages プロジェクト一覧チェック（アカウントIDが必要）
        const CLOUDFLARE_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
        
        if (CLOUDFLARE_ACCOUNT_ID) {
            const pagesResponse = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects`, {
                headers: {
                    'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            });
            
            const pagesData = await pagesResponse.json();
            
            if (pagesData.success) {
                console.log('✓ Pagesプロジェクト取得成功:');
                pagesData.result.forEach(project => {
                    console.log(`  - ${project.name} (${project.subdomain}.pages.dev)`);
                });
            } else {
                console.log('✗ Pagesプロジェクト取得失敗:', pagesData.errors);
            }
        } else {
            console.log('⚠ CLOUDFLARE_ACCOUNT_ID が設定されていません');
        }
        
    } catch (error) {
        console.error('APIリクエストエラー:', error.message);
    }
}

checkToken();