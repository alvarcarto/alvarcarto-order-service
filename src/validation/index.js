const Joi = require('joi');
const { getSupportedCurrencies } = require('alvarcarto-price-util');

const MAX_QUANTITY = 100000;

const addressSchema = Joi.object({
  personName: Joi.string().min(1).max(300).required(),
  streetAddress: Joi.string().min(1).max(300).required(),
  streetAddressExtra: Joi.string().min(1).max(300).optional(),
  city: Joi.string().min(1).max(300).required(),
  postalCode: Joi.string().min(1).max(30).required(),
  countryCode: Joi.string().length(2).required(),
  state: Joi.string().min(1).max(300).optional(),
  contactPhone: Joi.string().min(1).max(300).optional(),
});

const latLngSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
});

const mapIds = [
  'custom-map-print-30x40cm',
  'custom-map-print-50x70cm',
  'custom-map-print-70x100cm',
  'custom-map-print-12x18inch',
  'custom-map-print-18x24inch',
  'custom-map-print-24x36inch',
  'custom-map-plywood-30x40cm',
  'custom-map-plywood-50x70cm',
  'custom-map-plywood-12x18inch',
  'custom-map-plywood-18x24inch',
];
const mapCartItemSchema = Joi.object({
  sku: Joi.string().valid(mapIds).required(),
  quantity: Joi.number().min(1).max(MAX_QUANTITY),
  customisation: Joi.object({
    mapBounds: Joi.object({
      southWest: latLngSchema.required(),
      northEast: latLngSchema.required(),
    }).required(),
    mapCenter: latLngSchema.optional(),
    mapZoom: Joi.number().min(0).max(30).optional(),
    posterStyle: Joi.string().required(),
    mapStyle: Joi.string().required(),
    mapPitch: Joi.number().optional(),
    mapBearing: Joi.number().min(-360).max(360).optional(),
    orientation: Joi.string().valid(['landscape', 'portrait']).required(),
    labelsEnabled: Joi.boolean().required(),
    labelHeader: Joi.string().min(0).max(100).required(),
    labelSmallHeader: Joi.string().min(0).max(100).required(),
    labelText: Joi.string().min(0).max(500).required(),
  }),
}).unknown(); // Ignore additional fields

const giftCardValueCartItemSchema = Joi.object({
  sku: Joi.string().valid(['gift-card-value']).required(),
  customisation: Joi.object({
    netValue: Joi.number().integer().min(1).max(5000000),
  }),
  quantity: Joi.number().integer().min(1).max(MAX_QUANTITY),
});

const otherCartItemSchema = Joi.object({
  sku: Joi.string().required(),
  quantity: Joi.number().integer().min(1).max(MAX_QUANTITY),
}).unknown();

const cartItemSchema = Joi.alternatives()
  .when(Joi.object({ sku: Joi.string().valid('gift-card-value').required() }).unknown().required(), {
    then: giftCardValueCartItemSchema,
  })
  .when(Joi.object({ sku: Joi.string().valid(mapIds).required() }).unknown().required(), {
    then: mapCartItemSchema,
  })
  // Allow any other cart item such as shipping
  .when(Joi.any(), { then: otherCartItemSchema });

const cartSchema = Joi.array().items(cartItemSchema).min(1).max(1000);

const printmotorWebhookPayloadSchema = Joi.object({
  eventType: Joi.string().required(),
  userOrder: Joi.object({
    orderNumber: Joi.number().required(),
    meta: Joi.object(),
    deliveryTime: Joi.string().optional(),
    estimatedDeliveryTime: Joi.string().optional(),
    processingStatusDescription: Joi.string().required(),
    postalClass: Joi.string().required(),
  }).required().unknown(),
}).unknown();

const orderIdSchema = Joi.string().regex(/^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{4}$/);

const promotionCodeSchema = Joi.string().regex(/^[A-Z0-9-]+$/).min(1).max(40);
const promotionSchema = Joi.object({
  promotionCode: promotionCodeSchema,
  type: Joi.string().valid(['FIXED', 'PERCENTAGE']).required(),
  value: Joi.number().min(-100000).max(100000).required(),
  currency: Joi.string().valid(getSupportedCurrencies()).required(),
  label: Joi.string().min(1).max(30).required(),
  description: Joi.string().min(0).max(10000).optional(),
  maxAllowedUsageCount: Joi.number().integer().min(1).max(30)
    .optional(),
  expiresAt: Joi.date().iso().optional(),
});

const orderSchema = Joi.object({
  email: Joi.string().email().required(),
  differentBillingAddress: Joi.boolean().optional(),
  currency: Joi.string().valid(getSupportedCurrencies()).required(),
  emailSubscription: Joi.boolean().optional(),
  shippingAddress: addressSchema.optional(),
  billingAddress: addressSchema.optional(),
  cart: cartSchema.required(),
  promotionCode: promotionCodeSchema.optional(),
}).unknown();

module.exports = {
  addressSchema,
  cartItemSchema,
  cartSchema,
  printmotorWebhookPayloadSchema,
  orderIdSchema,
  promotionSchema,
  promotionCodeSchema,
  latLngSchema,
  orderSchema,
};
