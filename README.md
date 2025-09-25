
# Little Hero Books - Personalized Children's Books

**"Every child is the hero of their own story"**

Little Hero Books creates magical, personalized children's stories where each child becomes the hero of *The Adventure Compass* - a journey through enchanted locations before returning home. Our system uses template-based story generation with consistent quality and automated print-on-demand fulfillment.

## 🎯 **Current Status: Ready for n8n Handoff**

### ✅ **What's Complete:**
- **Renderer Service**: Beautiful PDF generation with custom templates
- **Template Story System**: Consistent base story with personalization placeholders
- **Amazon SP-API Middleware**: Complete integration (ready for when needed)
- **Asset Management**: Prefab backgrounds and character overlay system
- **POD Integration**: Complete with Lulu Print API
- **Environment Configuration**: Full development setup

### 🔧 **Ready for n8n Implementation**
**All core components are built, tested, and ready for n8n workflow implementation.**

**Customer Flow**: Amazon Custom → n8n → Renderer → POD → Delivery
- **No customer website required** in MVP
- **Customer discovers** book on Amazon
- **Customer customizes** on Amazon Custom listing
- **Customer purchases** through Amazon checkout
- **n8n handles** everything automatically

### 📋 **For n8n Developer**
See **[N8N_HANDOFF_GUIDE.md](docs/N8N_HANDOFF_GUIDE.md)** for complete implementation instructions.

### 🎨 **The Adventure Compass Story**

Each book follows a magical journey where the child discovers a compass that guides them through:
1. **Enchanted Forest** - Meeting friendly creatures
2. **Tall Mountain** - Climbing with their animal companion  
3. **Sparkling Sky** - Flying among clouds shaped like their favorite food
4. **Magical Sea** - Exploring with dolphins and sea creatures
5. **Rainbow Garden** - Discovering their inner hero
6. **Return Home** - Completing their adventure

**Personalization includes**: Child's name, appearance, favorite animal/food/color, hometown, and custom dedication message.

## 🏗️ **Architecture & Services**

### **Core Services:**
- **`renderer/`** - PDF generation service (Node.js/TypeScript)
- **`templates/`** - Template-based story system with personalization
- **`assets/`** - Prefab backgrounds and character overlay system
- **`amazon/`** - SP-API middleware (ready for future use)
- **`n8n/workflows/`** - Automation workflows (ready to configure)

### **Supporting Files:**
- **`docs/`** - Complete documentation and strategy guides
- **`data/`** - Order data models and validation
- **`pod/`** - Print-on-demand provider examples

## 🚀 **Development Setup**

### **Quick Start:**
```bash
# Install all dependencies
npm run install-deps

# Start all services
npm run dev:all

# Test individual services
npm run test:renderer  # http://localhost:8787/health
npm run test:amazon    # http://localhost:4000/health
```

### **Individual Services:**
```bash
npm run dev           # Renderer service only
npm run dev:amazon    # Amazon middleware only  
npm run dev:templates # Template system only
```

## 📋 **Current Development Strategy**

### **Phase 1: Build Without Amazon Fees (Current)**
- ✅ **Renderer Service**: PDF generation working
- ✅ **Template Story System**: Consistent base story with personalization
- ✅ **Asset Management**: Prefab backgrounds and character overlays
- 🔧 **POD Integration**: Ready to build (Lulu/OnPress)
- 🔧 **Customer Website**: Ready to build
- 🔧 **n8n Workflows**: Ready to configure

### **Phase 2: Amazon Integration (Future)**
- ✅ **SP-API Middleware**: Already built and ready
- 🔧 **Amazon Custom Listing**: When ready to pay $40/month
- 🔧 **Order Processing**: Connect to existing system

## 📊 **Technical Specifications**

- **Book Format**: 8×10 softcover, 16 pages (14 interior + covers)
- **Target Age**: 3-7 years old
- **Personalization**: Name, appearance, favorite things, hometown, dedication
- **Art Style**: Watercolor illustrations with character overlays
- **Shipping**: US-only initially
- **Price Strategy**: $19.99-$29.99 (introductory to standard pricing)
