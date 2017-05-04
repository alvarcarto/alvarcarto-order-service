#!/bin/bash

echo "Cleaning existing inlined emails .. "
rm email-templates/*inlined.html

echo "Inlining receipt email .. "
./node_modules/.bin/juice email-templates/receipt.html email-templates/receipt.inlined.html

echo "Done."
