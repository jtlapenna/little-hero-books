# Amazon SP-API Setup Guide

This guide walks you through setting up Amazon SP-API integration for Little Hero Books.

## 🎯 **Current Status**

**Amazon Integration**: ✅ **COMPLETE & READY**  
**Middleware**: Built and tested, ready for use  
**Next Step**: Set up Amazon Professional Seller account when ready to pay $40/month

## 💰 **Cost Considerations**

- **Amazon Professional Seller Account**: $40/month
- **Amazon Custom Program**: Additional fees per order
- **SP-API Usage**: ~$0.01 per order

**Recommendation**: Build and test complete system first, then add Amazon when ready to commit to monthly fees.

## 🎯 Overview

The Amazon integration consists of:
1. **SP-API Middleware** - Handles authentication and API calls
2. **Order Processor** - Processes Amazon Custom orders
3. **Customization Parser** - Extracts personalization data
4. **Integration Flow** - Connects Amazon → Renderer → POD

## 🔧 Prerequisites

### Amazon Developer Account
1. Create an Amazon Developer account at [developer.amazon.com](https://developer.amazon.com)
2. Complete the developer verification process
3. Accept the SP-API terms and conditions

### Amazon Seller Account
1. Create an Amazon Seller account
2. Enroll in Amazon Custom program
3. Create your personalized book listing

## 📋 Step-by-Step Setup

### Step 1: Create SP-API Application

1. **Navigate to SP-API Developer Console**
   - Go to [developer.amazon.com/sp-api](https://developer.amazon.com/sp-api)
   - Sign in with your developer account

2. **Create New Application**
   - Click "Create new application"
   - Application name: "Little Hero Books"
   - Description: "Personalized children's books with automated fulfillment"

3. **Configure Application**
   - Application Type: "Web application"
   - Redirect URL: `http://localhost:4000/auth/callback`
   - Note: This is for development; update for production

4. **Save Credentials**
   - Copy the Client ID and Client Secret
   - Add them to your `.env` file:
   ```bash
   AMZ_APP_CLIENT_ID=your_client_id_here
   AMZ_APP_CLIENT_SECRET=your_client_secret_here
   ```

### Step 2: Get Refresh Token

1. **Generate Authorization URL**
   ```bash
   # Replace with your actual client ID and redirect URL
   https://sellercentral.amazon.com/apps/authorize/consent?application_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:4000/auth/callback&version=beta
   ```

2. **Authorize Application**
   - Visit the URL in your browser
   - Sign in with your seller account
   - Grant permissions to the application
   - Copy the authorization code from the redirect URL

3. **Exchange for Refresh Token**
   ```bash
   curl -X POST https://api.amazon.com/auth/o2/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code&code=YOUR_AUTHORIZATION_CODE&client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET"
   ```

4. **Save Refresh Token**
   ```bash
   AMZ_REFRESH_TOKEN=your_refresh_token_here
   ```

### Step 3: Configure Seller Information

```bash
# Your Amazon Seller ID (found in Seller Central)
AMZ_SELLER_ID=your_seller_id_here

# Marketplace (US for North America)
AMZ_MARKETPLACE_ID=ATVPDKIKX0DER
AMZ_REGION=na
```

### Step 4: Create Amazon Custom Listing

1. **Access Amazon Custom**
   - Go to [sellercentral.amazon.com/custom](https://sellercentral.amazon.com/custom)
   - Sign in with your seller account

2. **Create Product Listing**
   - Product name: "Personalized Children's Book - The Adventure Compass"
   - Category: Books > Children's Books
   - Price: $29.99 (or your preferred price)

3. **Configure Customization Fields**
   ```
   Child's Name (Required): Text input, max 20 characters
   Child's Age (Required): Dropdown, 3-7 years
   Hair Color (Required): Dropdown (Black, Brown, Blonde, Red, Other)
   Skin Tone (Required): Dropdown (Light, Medium, Dark, Olive, Tan)
   Favorite Animal (Optional): Text input
   Favorite Food (Optional): Text input
   Favorite Color (Optional): Dropdown
   Hometown (Optional): Text input
   Dedication Message (Optional): Text area, max 500 characters
   ```

4. **Upload Product Images**
   - Cover image: 1000x1000px minimum
   - Additional images showing personalization options
   - Comply with Amazon image requirements

5. **Set Processing Time**
   - Processing time: 3-5 business days
   - This allows time for book generation and printing

### Step 5: Test the Integration

1. **Start the Middleware**
   ```bash
   cd amazon
   npm run dev
   ```

2. **Test Health Check**
   ```bash
   curl http://localhost:4000/health
   ```

3. **Test Order Fetching**
   ```bash
   curl http://localhost:4000/orders
   ```

4. **Place Test Order**
   - Create a test order through Amazon Custom
   - Use your development environment
   - Verify the order appears in your system

### Step 6: Production Deployment

1. **Update Environment Variables**
   ```bash
   NODE_ENV=production
   AMAZON_MIDDLEWARE_URL=https://your-domain.com/amazon
   ```

2. **Update Redirect URLs**
   - Update SP-API application redirect URL
   - Use your production domain

3. **Deploy Services**
   - Deploy middleware to your server
   - Set up SSL certificates
   - Configure load balancing if needed

## 🔍 Troubleshooting

### Common Issues

**"Invalid client credentials"**
- Verify Client ID and Client Secret are correct
- Ensure application is approved for SP-API access

**"Refresh token expired"**
- Generate a new refresh token
- Update the token in your environment variables

**"Order not found"**
- Check that the order ID is correct
- Verify the order exists in your seller account
- Ensure the order is from the correct marketplace

**"Customization data missing"**
- Verify your Amazon Custom listing fields
- Check that customers filled out all required fields
- Review the customization parsing logic

### Debug Mode

Enable debug logging by setting:
```bash
DEBUG_MODE=true
LOG_LEVEL=debug
```

This will provide detailed logs for troubleshooting.

## 📊 Monitoring

### Key Metrics to Track

- **Order Processing Time**: Average time from order to fulfillment
- **Success Rate**: Percentage of orders processed successfully
- **Error Rate**: Frequency and types of errors
- **API Response Times**: SP-API call performance

### Health Checks

- Middleware health: `GET /health`
- Order processing status: Check order status map
- Renderer service status: `GET http://localhost:8787/health`

## 🔐 Security Considerations

1. **Environment Variables**
   - Never commit API keys to version control
   - Use secure secret management in production
   - Rotate credentials regularly

2. **API Security**
   - Use HTTPS in production
   - Implement rate limiting
   - Monitor for suspicious activity

3. **Data Privacy**
   - Handle customer data according to privacy laws
   - Implement data retention policies
   - Secure data transmission and storage

## 📞 Support

- **Amazon SP-API Documentation**: [developer-docs.amazon.com/sp-api](https://developer-docs.amazon.com/sp-api)
- **Amazon Seller Support**: [sellercentral.amazon.com/help](https://sellercentral.amazon.com/help)
- **Little Hero Books Support**: hello@littleherobooks.com

---

**Next Steps**: Once Amazon integration is working, proceed to n8n workflow setup for complete automation.
