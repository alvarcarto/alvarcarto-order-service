#!/bin/bash

echo "Cleaning existing inlined emails .. "
rm email-templates/*inlined.html

echo "Inlining receipt email .. "
./node_modules/.bin/juice email-templates/receipt.html email-templates/receipt.inlined.html
./node_modules/.bin/juice email-templates/delivery-started.html email-templates/delivery-started.inlined.html
./node_modules/.bin/juice email-templates/delivery-update.html email-templates/delivery-update.inlined.html
./node_modules/.bin/juice email-templates/delivery-late.html email-templates/delivery-late.inlined.html

echo "Done."
