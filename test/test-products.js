/* eslint-env mocha */

const { expect } = require('chai');
const request = require('./util/request');

function test() {
  describe('retargeting matching', () => {
    it('in Lauttasaari should return Helsinki and Espoo as the closest', () => {
      return request()
        .get('/api/cities')
        .query({
          // Lauttasaari
          lat: 60.157576,
          lng: 24.877261,
        })
        .expect(200)
        .then((res) => {
          expect(res.body[0].name).to.equal('Helsinki');
          expect(res.body[0].id).to.equal('60.170L24.935');
          expect(res.body[1].name).to.equal('Espoo');
          expect(res.body[1].id).to.equal('60.205L24.652');
        });
    });

    it('nearby Moscow should return Moscow as the closest because population', () => {
      return request()
        .get('/api/cities')
        .query({
          // In Russia, nearby Moscow
          lat: 55.777307,
          lng: 37.831317,
        })
        .expect(200)
        .then((res) => {
          expect(res.body[0].name).to.equal('Moscow');
          expect(res.body[0].id).to.equal('55.752L37.616');
        });
    });

    it('nearby Edmonton, Canada should return Edmonton as the closest', () => {
      return request()
        .get('/api/cities')
        .query({
          // Nearby Edmonton
          lat: 53.897479,
          lng: -113.481532,
        })
        .expect(200)
        .then((res) => {
          expect(res.body[0].name).to.equal('Edmonton');
          expect(res.body[0].id).to.equal('53.550L-113.469');
        });
    });

    it('nearby Lisbon should return Lisbon as the closest because population', () => {
      return request()
        .get('/api/cities')
        .query({
          // In Carregado, nearby Lisbon
          lat: 38.998067,
          lng: -8.985534,
        })
        .expect(200)
        .then((res) => {
          expect(res.body[0].name).to.equal('Lisbon');
          expect(res.body[0].id).to.equal('38.717L-9.133');
        });
    });

    it('nearby San Francisco should return SF as the closest', () => {
      return request()
        .get('/api/cities')
        .query({
          // Nearby SF
          lat: 37.824998,
          lng: -122.058109,
        })
        .expect(200)
        .then((res) => {
          expect(res.body[0].name).to.equal('San Francisco');
          expect(res.body[0].id).to.equal('37.775L-122.419');
        });
    });

    it('query should find results if the center is 490km from SF', () => {
      return request()
        .get('/api/cities')
        .query({
          // Towards West from SF
          lat: 37.77493,
          lng: -127.98209,
        })
        .expect(200)
        .then((res) => {
          expect(res.body[0].name).to.equal('San Francisco');
          expect(res.body[0].id).to.equal('37.775L-122.419');
          expect(res.body[0].distanceMeters).to.equal(490000);
        });
    });

    it('query should find zero results if the center is >500km from SF', () => {
      return request()
        .get('/api/cities')
        .query({
          // Towards West from SF
          lat: 37.77493,
          lng: -128.98209,
        })
        .expect(200)
        .then((res) => {
          expect(res.body.length).to.equal(0);
        });
    });

    it('nearby Cape Town should return zero results as Africa is not in data yet', () => {
      return request()
        .get('/api/cities')
        .query({
          // Nearby Cape Town
          lat: -34.006005,
          lng: 18.502981,
        })
        .expect(200)
        .then((res) => {
          expect(res.body.length).to.equal(0);
        });
    });

    it('nearby Sydney should return zero results as Australia is not in data yet', () => {
      return request()
        .get('/api/cities')
        .query({
          // Nearby Sydney
          lat: -33.914547,
          lng: 150.183852,
        })
        .expect(200)
        .then((res) => {
          expect(res.body.length).to.equal(0);
        });
    });

    it('nearby Buenos Aires should return zero results as South America is not in data yet', () => {
      return request()
        .get('/api/cities')
        .query({
          // Nearby Buenos Aires
          lat: -34.664580,
          lng: -58.493954,
        })
        .expect(200)
        .then((res) => {
          expect(res.body.length).to.equal(0);
        });
    });

    it('nearby Cancun, Mexico should return zero results as Middle America is not in data yet', () => {
      return request()
        .get('/api/cities')
        .query({
          // Nearby Cancun
          lat: 21.136710,
          lng: -86.858205,
        })
        .expect(200)
        .then((res) => {
          expect(res.body.length).to.equal(0);
        });
    });

    it('nearby Hong Kong should return zero results as China is not in the data yet', () => {
      return request()
        .get('/api/cities')
        .query({
          // Nearby Hong Kong
          lat: 22.346130,
          lng: 114.166949,
        })
        .expect(200)
        .then((res) => {
          expect(res.body.length).to.equal(0);
        });
    });

    it('nearby Tokyo should return zero results as Japan is not in the data yet', () => {
      return request()
        .get('/api/cities')
        .query({
          // Nearby Tokyo
          lat: 35.727023,
          lng: 139.743493,
        })
        .expect(200)
        .then((res) => {
          expect(res.body.length).to.equal(0);
        });
    });

    it('nearby New Delhi should return zero results as India is not in the data yet', () => {
      return request()
        .get('/api/cities')
        .query({
          // Nearby New Delhi
          lat: 28.579025,
          lng: 77.199861,
        })
        .expect(200)
        .then((res) => {
          expect(res.body.length).to.equal(0);
        });
    });
  });
}

module.exports = test;
