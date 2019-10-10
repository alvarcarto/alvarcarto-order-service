const Joi = require('joi');

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

const mapCartItemSchema = Joi.object({
  type: Joi.string().valid(['mapPoster']).optional(),
  quantity: Joi.number().min(1).max(100000),
  mapBounds: Joi.object({
    southWest: latLngSchema.required(),
    northEast: latLngSchema.required(),
  }).required(),
  mapCenter: latLngSchema.optional(),
  mapZoom: Joi.number().min(0).max(30).optional(),
  posterStyle: Joi.string().valid([
    'sharp', 'classic', 'sans', 'bw',
    'pacific', 'summer', 'round',
  ]).required(),
  mapStyle: Joi.string().valid([
    'bw', 'gray', 'black', 'petrol',
    'iceberg', 'marshmellow', 'copper',
    'madang',
  ]).required(),
  mapPitch: Joi.number().optional(),
  mapBearing: Joi.number().min(-360).max(360).optional(),
  orientation: Joi.string().valid(['landscape', 'portrait']).required(),
  size: Joi.string().valid(['30x40cm', '50x70cm', '70x100cm', '12x18inch', '18x24inch', '24x36inch']).required(),
  labelsEnabled: Joi.boolean().required(),
  labelHeader: Joi.string().min(0).max(100).required(),
  labelSmallHeader: Joi.string().min(0).max(100).required(),
  labelText: Joi.string().min(0).max(500).required(),
}).unknown();  // Ignore additional fields

const physicalGiftCardCartItemSchema = Joi.object({
  type: Joi.string().valid(['physicalGiftCard']).required(),
  quantity: Joi.number().integer().min(1).max(1000),
});

const giftCardValueCartItemSchema = Joi.object({
  type: Joi.string().valid(['giftCardValue']).required(),
  value: Joi.number().integer().min(1).max(5000000),
  quantity: Joi.number().integer().min(1).max(1000),
});

const productionClassCartItemSchema = Joi.object({
  type: Joi.string().valid(['productionClass']).required(),
  value: Joi.string().valid(['REGULAR', 'HIGH']).required(),
  quantity: Joi.number().integer().min(1).max(1),
});

const shippingClassCartItemSchema = Joi.object({
  type: Joi.string().valid(['shippingClass']).required(),
  value: Joi.string().valid(['EXPRESS']).required(),
  quantity: Joi.number().integer().min(1).max(1),
});

const cartItemSchema = Joi.alternatives()
  .when(Joi.object({ type: Joi.string().valid('productionClass').required() }).unknown().required(), {
    then: productionClassCartItemSchema,
  })
  .when(Joi.object({ type: Joi.string().valid('shippingClass').required() }).unknown().required(), {
    then: shippingClassCartItemSchema,
  })
  .when(Joi.object({ type: Joi.string().valid('giftCardValue').required() }).unknown().required(), {
    then: giftCardValueCartItemSchema,
  })
  .when(Joi.object({ type: Joi.string().valid('physicalGiftCard').required() }).unknown().required(), {
    then: physicalGiftCardCartItemSchema,
  })
  .when(Joi.object({ type: Joi.string().valid('mapPoster').required() }).unknown().required(), {
    then: mapCartItemSchema,
  })
  // Default to mapPoster type
  .when(Joi.any(), { then: mapCartItemSchema });

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
  currency: Joi.string().valid(['EUR']).required(),
  label: Joi.string().min(1).max(30).required(),
  description: Joi.string().min(0).max(10000).optional(),
  maxAllowedUsageCount: Joi.number().integer().min(1).max(30).optional(),
  expiresAt: Joi.date().iso().optional(),
});

const orderSchema = Joi.object({
  email: Joi.string().email().required(),
  differentBillingAddress: Joi.boolean().optional(),
  currency: Joi.string().valid(['EUR', 'USD']).optional(),
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
