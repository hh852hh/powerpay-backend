const crypto = require('crypto');
const axios = require('axios');

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
    const API_URL = 'https://uat.powerpaygroup.com/gateway/pay';

    console.log('🔑 商戶號:', MERCHANT_NO);
    console.log('🔐 MD5 Key:', MD5_KEY); // 完整顯示以確認
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

    // ===== 方法 1: 不編碼 URL =====
    console.log('\n===== 嘗試方法 1: URL 不編碼 =====');
    const params1 = { ...params };
    const sortedKeys1 = Object.keys(params1).sort();
    const signString1 = sortedKeys1
      .map(key => `${key}=${params1[key]}`)
      .join('&') + `&key=${MD5_KEY}`;
    const sign1 = crypto.createHash('md5').update(signString1, 'utf8').digest('hex').toUpperCase();
    
    console.log('🔐 簽名字符串 1:', signString1);
    console.log('✅ 簽名 1:', sign1);

    // ===== 方法 2: URL 編碼（僅對值） =====
    console.log('\n===== 嘗試方法 2: URL 編碼值 =====');
    const params2 = {};
    Object.keys(params).forEach(key => {
      params2[key] = encodeURIComponent(params[key]);
    });
    const sortedKeys2 = Object.keys(params2).sort();
    const signString2 = sortedKeys2
      .map(key => `${key}=${params2[key]}`)
      .join('&') + `&key=${MD5_KEY}`;
    const sign2 = crypto.createHash('md5').update(signString2, 'utf8').digest('hex').toUpperCase();
    
    console.log('🔐 簽名字符串 2:', signString2);
    console.log('✅ 簽名 2:', sign2);

    // ===== 方法 3: 簽名前先解碼值 =====
    console.log('\n===== 嘗試方法 3: 原始值簽名 =====');
    const sortedKeys3 = Object.keys(params).sort();
    const signString3 = sortedKeys3
      .map(key => `${key}=${params[key]}`)
      .join('&') + `&key=${MD5_KEY}`;
    const sign3 = crypto.createHash('md5').update(signString3, 'utf8').digest('hex').toUpperCase();
    
    console.log('🔐 簽名字符串 3:', signString3);
    console.log('✅ 簽名 3:', sign3);

    // 使用方法 1（不編碼）發送請求
    const finalParams = { ...params, sign: sign1 };

    // 轉換為 form-urlencoded
    const formData = new URLSearchParams();
    Object.keys(finalParams).forEach(key => {
      formData.append(key, finalParams[key]);
    });

    console.log('\n🚀 發送請求到:', API_URL);
    console.log('📤 最終參數:', finalParams);

    // 調用 API
    const response = await axios.post(API_URL, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    console.log('📥 HTTP 狀態:', response.status);
    console.log('📥 PowerPay 響應:', JSON.stringify(response.data, null, 2));

    // 如果失敗，返回所有調試信息
    if (response.data.code !== '00') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ...response.data,
          debug: {
            sign1: sign1,
            sign2: sign2,
            sign3: sign3,
            signString1: signString1,
            signString2: signString2,
            signString3: signString3,
            merchantNo: MERCHANT_NO,
            mdkKeyLength: MD5_KEY.length,
          }
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response.data),
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
