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
    console.log('🔐 MD5 Key 長度:', MD5_KEY.length);
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

    console.log('📦 PowerPay 參數（簽名前）:', JSON.stringify(params, null, 2));

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

    // 轉換為 URLSearchParams（form-urlencoded）
    const formData = new URLSearchParams();
    Object.keys(filteredParams).forEach(key => {
      formData.append(key, filteredParams[key]);
    });

    console.log('🚀 調用 PowerPay API:', API_URL);
    console.log('📤 請求參數:', filteredParams);

    // 使用 axios 調用 API
    const response = await axios.post(API_URL, formData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      timeout: 30000, // 30秒超時
      validateStatus: () => true, // 接受所有狀態碼
    });

    console.log('📥 HTTP 狀態碼:', response.status);
    console.log('📥 PowerPay 響應:', JSON.stringify(response.data, null, 2));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response.data),
    };

  } catch (error) {
    console.error('❌ 錯誤類型:', error.constructor.name);
    console.error('❌ 錯誤信息:', error.message);
    console.error('❌ 錯誤堆疊:', error.stack);
    
    if (error.response) {
      console.error('📥 錯誤響應狀態:', error.response.status);
      console.error('📥 錯誤響應數據:', error.response.data);
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message,
        type: error.constructor.name,
        details: error.stack,
        response: error.response ? {
          status: error.response.status,
          data: error.response.data,
        } : null,
      }),
    };
  }
};
