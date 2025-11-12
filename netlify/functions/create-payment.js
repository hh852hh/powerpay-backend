const crypto = require('crypto');
const https = require('https');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const requestData = JSON.parse(event.body);
    console.log('📥 收到前端請求:', JSON.stringify(requestData, null, 2));

    // PowerPay 配置
    const MERCHANT_NO = process.env.POWERPAY_MERCHANT_NO || '300000004';
    const MD5_KEY = process.env.POWERPAY_MD5_KEY || '94ed508f4bc242b88ddd0f0d644ebe7a';
    const API_URL = 'https://www.powerpayhk.com/hkpay/native/service';

    console.log('🔑 商戶號:', MERCHANT_NO);
    console.log('🔐 MD5 Key:', MD5_KEY);
    console.log('🌐 API URL:', API_URL);

    // 構建參數
    const params = {
      merchantNo: MERCHANT_NO,
      orderNo: requestData.orderNo,
      amount: String(requestData.amount),
      subject: requestData.subject,
      payType: requestData.payType,
      frontUrl: requestData.frontUrl,
      notifyUrl: requestData.notifyUrl,
    };

    // UnionPay 卡片信息
    if (requestData.payType === 'UNIONPAY') {
      if (requestData.cardNo) params.cardNo = requestData.cardNo;
      if (requestData.cardHolder) params.cardHolder = requestData.cardHolder;
      if (requestData.expireMonth) params.expireMonth = requestData.expireMonth;
      if (requestData.expireYear) params.expireYear = requestData.expireYear;
      if (requestData.cvv) params.cvv = requestData.cvv;
    }

    console.log('📦 原始參數:', JSON.stringify(params, null, 2));

    // 生成簽名
    const filteredParams = {};
    Object.keys(params).forEach(key => {
      if (params[key] !== null && params[key] !== undefined && params[key] !== '') {
        filteredParams[key] = params[key];
      }
    });

    const sortedKeys = Object.keys(filteredParams).sort();
    const signString = sortedKeys
      .map(key => `${key}=${filteredParams[key]}`)
      .join('&') + `&key=${MD5_KEY}`;
    
    console.log('🔐 待簽名字符串:', signString);
    
    const sign = crypto
      .createHash('md5')
      .update(signString, 'utf8')
      .digest('hex')
      .toUpperCase();
    
    console.log('✅ 生成的簽名:', sign);
    
    filteredParams.sign = sign;

    // 轉換為 JSON 格式
    const postData = JSON.stringify(filteredParams);

    console.log('🚀 發送請求到:', API_URL);
    console.log('📤 請求體 (JSON):', postData);

    // 使用原生 https 模塊發送請求
    const result = await new Promise((resolve, reject) => {
      const url = new URL(API_URL);
      
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'Accept': 'application/json',
        },
        timeout: 30000,
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          console.log('📥 HTTP 狀態:', res.statusCode);
          console.log('📥 響應頭:', JSON.stringify(res.headers, null, 2));
          console.log('📥 原始響應:', data);
          
          try {
            const jsonData = JSON.parse(data);
            console.log('📥 PowerPay 響應 (JSON):', JSON.stringify(jsonData, null, 2));
            resolve(jsonData);
          } catch (e) {
            console.error('❌ JSON 解析失敗:', e.message);
            resolve({ code: '99', msg: 'Invalid response', raw: data });
          }
        });
      });

      req.on('error', (error) => {
        console.error('❌ 請求錯誤:', error.message);
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(postData);
      req.end();
    });

    // 如果簽名驗證失敗，返回調試信息
    if (result.code === '96') {
      console.error('❌ 簽名驗證失敗！返回調試信息...');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ...result,
          debug: {
            signString: signString,
            sign: sign,
            params: filteredParams,
            merchantNo: MERCHANT_NO,
            mdkKeyLength: MD5_KEY.length,
            apiUrl: API_URL,
          }
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result),
    };

  } catch (error) {
    console.error('❌ 錯誤:', error.message);
    console.error('❌ 堆疊:', error.stack);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message,
        details: error.stack,
      }),
    };
  }
};
