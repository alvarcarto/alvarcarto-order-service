const _ = require('lodash');
const Joi = require('joi');
const { joiValidate } = require('./express-validation-index');

const stripeCreateTokenResponseSchema = Joi.object({
  id: Joi.string().required(),
  card: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
    exp_month: Joi.number().required(),
    exp_year: Joi.number().required(),
    last4: Joi.string().required(),
    brand: Joi.string().required(),
  }).required(),
  livemode: Joi.boolean().required(),
  client_ip: Joi.string().required(),
}).unknown();

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
  size: Joi.string().valid(['30x40cm', '50x70cm', '70x100cm']).required(),
  labelsEnabled: Joi.boolean().required(),
  labelHeader: Joi.string().min(0).max(100).required(),
  labelSmallHeader: Joi.string().min(0).max(100).required(),
  labelText: Joi.string().min(0).max(500).required(),
}).unknown();  // Ignore additional fields

const physicalGiftCardCartItemSchema = Joi.object({
  type: Joi.string().valid(['physicalGiftCard']).required(),
  // This is temporarily limited for 1 quantity to prevent accidental errors
  quantity: Joi.number().integer().min(1).max(1),
});

const giftCardValueCartItemSchema = Joi.object({
  type: Joi.string().valid(['giftCardValue']).required(),
  // This is temporarily limited for 1 quantity to prevent accidental errors
  value: Joi.number().integer().min(1).max(5000000),
  quantity: Joi.number().integer().min(1).max(1),
});

/*
const cartItemSchema = Joi.alternatives().when('i.type', {
  is: 'giftCardValue',
  then: giftCardValueCartItemSchema,
  otherwise: Joi.when('i.type', {
    is: 'physicalGiftCard',
    then: physicalGiftCardCartItemSchema,
    otherwise: mapCartItemSchema,
  }),
});
*/

const cartItemSchema = Joi.alternatives()
  .when(Joi.object({ type: 'giftCardValue' }).unknown(), { then: giftCardValueCartItemSchema })
  .when(Joi.object({ type: 'physicalGiftCard' }).unknown(), { then: physicalGiftCardCartItemSchema })
  .when(Joi.object({ type: 'mapPoster' }).unknown(), {
    then: mapCartItemSchema,
    otherwise: mapCartItemSchema,
  });

const cartTooGenericSchema = Joi.array().items(cartItemSchema).min(1).max(1000);

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
const promotionCodeSchema = Joi.string().regex(/^[A-Za-z0-9-]+$/);

const orderSchema = Joi.object({
  email: Joi.string().email().required(),
  differentBillingAddress: Joi.boolean().optional(),
  emailSubscription: Joi.boolean().optional(),
  shippingAddress: addressSchema.required(),
  billingAddress: addressSchema.optional(),
  // If this is not defined, order must have a promotion code which fully
  // covers the total price
  stripeTokenResponse: stripeCreateTokenResponseSchema.optional(),
  cart: cartTooGenericSchema.required(),
  promotionCode: promotionCodeSchema.optional(),
}).unknown();

function cartItemsValidation(req) {
  _.forEach(req.body.cart, (item) => {
    switch (item.type) {
      case 'giftCardValue':
        joiValidate(item, giftCardValueCartItemSchema);
        return;
      case 'physicalGiftCard':
        joiValidate(item, physicalGiftCardCartItemSchema);
        return;
      case 'mapPoster':
      default:
        joiValidate(item, mapCartItemSchema);
    }
  });
}

function customValidation(validationFuncs) {
  return (req, res, next) => {
    try {
      _.forEach(validationFuncs, f => f(req));
    } catch (e) {
      return next(e);
    }

    return next();
  };
}

module.exports = {
  addressSchema,
  cartItemSchema,
  cartTooGenericSchema,
  stripeCreateTokenResponseSchema,
  printmotorWebhookPayloadSchema,
  orderIdSchema,
  promotionCodeSchema,
  latLngSchema,
  orderSchema,
  customValidation,
  cartItemsValidation,
};
