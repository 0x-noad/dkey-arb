(window["webpackJsonp"] = window["webpackJsonp"] || []).push([[0],{

/***/ "./node_modules/isows/_esm/native.js":
/*!*******************************************!*\
  !*** ./node_modules/isows/_esm/native.js ***!
  \*******************************************/
/*! exports provided: WebSocket */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"WebSocket\", function() { return WebSocket; });\n/* harmony import */ var _utils_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./utils.js */ \"./node_modules/isows/_esm/utils.js\");\n\nvar WebSocket = Object(_utils_js__WEBPACK_IMPORTED_MODULE_0__[\"getNativeWebSocket\"])();\n\n//# sourceURL=webpack:///./node_modules/isows/_esm/native.js?");

/***/ }),

/***/ "./node_modules/isows/_esm/utils.js":
/*!******************************************!*\
  !*** ./node_modules/isows/_esm/utils.js ***!
  \******************************************/
/*! exports provided: getNativeWebSocket */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* WEBPACK VAR INJECTION */(function(global) {/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"getNativeWebSocket\", function() { return getNativeWebSocket; });\nfunction getNativeWebSocket() {\n  if (typeof WebSocket !== \"undefined\") return WebSocket;\n  if (typeof global.WebSocket !== \"undefined\") return global.WebSocket;\n  if (typeof window.WebSocket !== \"undefined\") return window.WebSocket;\n  if (typeof self.WebSocket !== \"undefined\") return self.WebSocket;\n  throw new Error(\"`WebSocket` is not supported in this environment\");\n}\n/* WEBPACK VAR INJECTION */}.call(this, __webpack_require__(/*! ./../../webpack/buildin/global.js */ \"./node_modules/webpack/buildin/global.js\")))\n\n//# sourceURL=webpack:///./node_modules/isows/_esm/utils.js?");

/***/ }),

/***/ "./node_modules/webpack/buildin/global.js":
/*!***********************************!*\
  !*** (webpack)/buildin/global.js ***!
  \***********************************/
/*! no static exports found */
/***/ (function(module, exports) {

eval("var g;\n\n// This works in non-strict mode\ng = (function() {\n\treturn this;\n})();\n\ntry {\n\t// This works if eval is allowed (see CSP)\n\tg = g || new Function(\"return this\")();\n} catch (e) {\n\t// This works if the window reference is available\n\tif (typeof window === \"object\") g = window;\n}\n\n// g can still be undefined, but nothing to do about it...\n// We return undefined, instead of nothing here, so it's\n// easier to handle this case. if(!global) { ...}\n\nmodule.exports = g;\n\n\n//# sourceURL=webpack:///(webpack)/buildin/global.js?");

/***/ })

}]);