const Cart = require('../../models/cart-schema');
const Product = require('../../models/product-schema');
const Wishlist = require('../../models/wishlist-schema');
const User = require('../../models/user-schema');

// Load cart page
const loadCart = async (req, res) => {
  try {
    const userId = req.session.userId;
    
    // Get user data for sidebar
    const user = await User.findById(userId).select('fullname email profilePhoto');
    if (!user) {
      return res.redirect('/login');
    }

    // Get user's cart with populated product data
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productId',
        populate: {
          path: 'category',
          select: 'name isListed isDeleted'
        }
      });

    // Filter out items with unavailable products
    let cartItems = [];
    if (cart && cart.items) {
      cartItems = cart.items.filter(item => 
        item.productId && 
        item.productId.category && 
        item.productId.category.isListed && 
        !item.productId.category.isDeleted &&
        item.productId.isListed &&
        !item.productId.isDeleted
      );
    }

    res.render('cart', {
      user,
      cartItems: cartItems || [],
      title: 'My Cart'
    });
  } catch (error) {
    console.error('Error loading cart:', error);
    res.status(500).render('error', { message: 'Error loading cart' });
  }
};

// Add product to cart with comprehensive validation
const addToCart = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { productId, quantity = 1 } = req.body;

    // Validate input
    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 10) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be between 1 and 10'
      });
    }

    // Get product with category
    const product = await Product.findById(productId).populate('category');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Enhanced product availability validation
    if (!product.isListed || product.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This product is no longer available for purchase',
        code: 'PRODUCT_UNAVAILABLE'
      });
    }

    // Enhanced category availability validation
    if (!product.category || !product.category.isListed || product.category.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'This product category is no longer available',
        code: 'CATEGORY_UNAVAILABLE'
      });
    }

    // Check stock availability
    if (product.quantity === 0) {
      return res.status(403).json({
        success: false,
        message: 'This product is currently out of stock',
        code: 'OUT_OF_STOCK'
      });
    }

    if (product.quantity < parsedQuantity) {
      return res.status(403).json({
        success: false,
        message: `Only ${product.quantity} items available in stock`,
        code: 'INSUFFICIENT_STOCK'
      });
    }

    // Find or create user's cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({
        userId,
        items: []
      });
    }

    // Check if product already exists in cart
    const existingItemIndex = cart.items.findIndex(
      item => item.productId.toString() === productId
    );

    if (existingItemIndex > -1) {
      // Update existing item
      const existingItem = cart.items[existingItemIndex];
      const newQuantity = existingItem.quantity + parsedQuantity;

      if (newQuantity > product.quantity) {
        return res.status(403).json({
          success: false,
          message: `Cannot add more items. Only ${product.quantity} available in stock. You already have ${existingItem.quantity} in your cart.`,
          code: 'CART_STOCK_LIMIT'
        });
      }

      if (newQuantity > 10) {
        return res.status(403).json({
          success: false,
          message: 'Maximum 10 items allowed per product in cart',
          code: 'CART_QUANTITY_LIMIT'
        });
      }

      existingItem.quantity = newQuantity;
      existingItem.price = product.salePrice; // Update price in case it changed
      existingItem.totalPrice = product.salePrice * newQuantity;
    } else {
      // Add new item
      cart.items.push({
        productId,
        quantity: parsedQuantity,
        price: product.salePrice,
        totalPrice: product.salePrice * parsedQuantity
      });
    }

    await cart.save();

    // Remove from wishlist if exists and get updated wishlist count
    let wishlistCount = 0;
    try {
      const wishlistResult = await Wishlist.updateOne(
        { userId },
        { $pull: { products: { productId } } }
      );

      // Get updated wishlist count
      const wishlist = await Wishlist.findOne({ userId });
      wishlistCount = wishlist ? wishlist.products.length : 0;
    } catch (wishlistError) {
      // Silently handle wishlist removal error
    }

    // Get updated cart count
    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);

    res.json({
      success: true,
      message: 'Product added to cart successfully',
      cartCount,
      wishlistCount
    });

  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add product to cart'
    });
  }
};

// Get cart count for navbar
const getCartCount = async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.json({ count: 0 });
    }

    const cart = await Cart.findOne({ userId });
    const count = cart ? cart.items.reduce((total, item) => total + item.quantity, 0) : 0;

    res.json({ count });

  } catch (error) {
    console.error('Error getting cart count:', error);
    res.json({ count: 0 });
  }
};

// Update cart item quantity
const updateCartQuantity = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { productId, quantity } = req.body;

    // Validate input
    if (!productId || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and quantity are required'
      });
    }

    const parsedQuantity = parseInt(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 1 || parsedQuantity > 10) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be between 1 and 10'
      });
    }

    // Get product to check stock
    const product = await Product.findById(productId).populate('category');
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check product and category availability
    if (!product.isListed || product.isDeleted ||
        !product.category || !product.category.isListed || product.category.isDeleted) {
      return res.status(403).json({
        success: false,
        message: 'Product is no longer available'
      });
    }

    // Check stock
    if (product.quantity < parsedQuantity) {
      return res.status(403).json({
        success: false,
        message: `Only ${product.quantity} items available in stock`
      });
    }

    // Find user's cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Find the item in cart
    const itemIndex = cart.items.findIndex(
      item => item.productId.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in cart'
      });
    }

    // Update quantity and total price
    cart.items[itemIndex].quantity = parsedQuantity;
    cart.items[itemIndex].price = product.salePrice; // Update price in case it changed
    cart.items[itemIndex].totalPrice = product.salePrice * parsedQuantity;

    await cart.save();

    // Get updated cart count
    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);

    res.json({
      success: true,
      message: 'Cart updated successfully',
      cartCount,
      itemTotal: cart.items[itemIndex].totalPrice
    });

  } catch (error) {
    console.error('Error updating cart quantity:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cart'
    });
  }
};

// Remove item from cart
const removeFromCart = async (req, res) => {
  try {
    const userId = req.session.userId;
    const { productId } = req.body;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required'
      });
    }

    // Find user's cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Remove the item from cart
    const initialLength = cart.items.length;
    cart.items = cart.items.filter(
      item => item.productId.toString() !== productId
    );

    if (cart.items.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in cart'
      });
    }

    await cart.save();

    // Get updated cart count
    const cartCount = cart.items.reduce((total, item) => total + item.quantity, 0);

    res.json({
      success: true,
      message: 'Product removed from cart successfully',
      cartCount
    });

  } catch (error) {
    console.error('Error removing from cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove product from cart'
    });
  }
};

// Clear entire cart
const clearCart = async (req, res) => {
  try {
    const userId = req.session.userId;

    // Find and clear user's cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    cart.items = [];
    await cart.save();

    res.json({
      success: true,
      message: 'Cart cleared successfully',
      cartCount: 0
    });

  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cart'
    });
  }
};

module.exports = {
  loadCart,
  addToCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
  getCartCount
};
