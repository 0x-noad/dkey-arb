/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "/";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./index.js");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./index.js":
/*!******************!*\
  !*** ./index.js ***!
  \******************/
/*! no static exports found */
/***/ (function(module, exports) {

eval("/**\n * Entry: landing (profile setup) and transition to terminal.\n * Imports dkey-lib for DkeyUserProfile (create, deserialize, fromEncryptedProfileData).\n */\n\n(function () {\n  var DkeyUserProfile = null;\n  var config = {}; // minimal wagmi config placeholder for profile load\n\n  function getEl(id) {\n    return document.getElementById(id);\n  }\n  function show(el) {\n    if (el) el.classList.remove(\"hidden\");\n  }\n  function hide(el) {\n    if (el) el.classList.add(\"hidden\");\n  }\n  function showError(id, msg) {\n    var el = getEl(id);\n    if (el) {\n      el.textContent = msg || \"\";\n      el.classList.toggle(\"hidden\", !msg);\n    }\n  }\n  function setProfile(profile) {\n    try {\n      var json = profile.serialize();\n      sessionStorage.setItem(\"dkey_profile_json\", json);\n      window.__dkeyProfile = profile;\n      goToTerminal();\n    } catch (e) {\n      showError(\"landing-message\", \"Failed to save profile: \" + (e && e.message));\n    }\n  }\n  function goToTerminal() {\n    hide(getEl(\"landing\"));\n    show(getEl(\"terminal-wrap\"));\n    if (typeof window.terminalReady === \"function\") window.terminalReady();\n  }\n  function createNewProfile() {\n    if (!DkeyUserProfile) {\n      showError(\"landing-message\", \"dkey-lib not loaded.\");\n      return;\n    }\n    try {\n      var profile = new DkeyUserProfile({}, {}, {}, {}, {}, config);\n      setProfile(profile);\n    } catch (e) {\n      showError(\"landing-message\", \"Failed to create profile: \" + (e && e.message));\n    }\n  }\n  function loadPastedProfile() {\n    if (!DkeyUserProfile) {\n      showError(\"landing-paste-error\", \"dkey-lib not loaded.\");\n      return;\n    }\n    var ta = getEl(\"landing-paste-input\");\n    var raw = ta && ta.value ? ta.value.trim() : \"\";\n    showError(\"landing-paste-error\", \"\");\n    if (!raw) {\n      showError(\"landing-paste-error\", \"Paste JSON first.\");\n      return;\n    }\n    try {\n      var profile = DkeyUserProfile.deserialize(raw, config);\n      setProfile(profile);\n    } catch (e) {\n      showError(\"landing-paste-error\", \"Invalid profile JSON: \" + (e && e.message));\n    }\n  }\n  function decryptAndLoadFile() {\n    if (!DkeyUserProfile) {\n      showError(\"landing-file-error\", \"dkey-lib not loaded.\");\n      return;\n    }\n    var fileInput = getEl(\"landing-file-input\");\n    var passwordInput = getEl(\"landing-file-password\");\n    var file = fileInput && fileInput.files && fileInput.files[0];\n    var password = passwordInput ? passwordInput.value : \"\";\n    showError(\"landing-file-error\", \"\");\n    if (!file) {\n      showError(\"landing-file-error\", \"Select a .enc file first.\");\n      return;\n    }\n    if (!password) {\n      showError(\"landing-file-error\", \"Enter the password.\");\n      return;\n    }\n    DkeyUserProfile.fromEncryptedProfileData(file, password, config).then(function (profile) {\n      setProfile(profile);\n    }).catch(function (e) {\n      showError(\"landing-file-error\", \"Decrypt failed: \" + (e && e.message));\n    });\n  }\n  function initLanding() {\n    var landing = getEl(\"landing\");\n    var terminalWrap = getEl(\"terminal-wrap\");\n    if (!landing || !terminalWrap) return;\n\n    // Restore profile from session and skip landing if present\n    var saved = sessionStorage.getItem(\"dkey_profile_json\");\n    if (saved) {\n      try {\n        if (DkeyUserProfile) {\n          window.__dkeyProfile = DkeyUserProfile.deserialize(saved, config);\n          goToTerminal();\n          return;\n        }\n      } catch (e) {\n        sessionStorage.removeItem(\"dkey_profile_json\");\n      }\n    }\n    show(landing);\n    hide(terminalWrap);\n    getEl(\"landing-new\").addEventListener(\"click\", createNewProfile);\n    getEl(\"landing-paste-toggle\").addEventListener(\"click\", function () {\n      var area = getEl(\"landing-paste-area\");\n      area.classList.toggle(\"hidden\", !area.classList.contains(\"hidden\"));\n      showError(\"landing-paste-error\", \"\");\n    });\n    getEl(\"landing-paste-submit\").addEventListener(\"click\", loadPastedProfile);\n    var fileInput = getEl(\"landing-file-input\");\n    var fileArea = getEl(\"landing-file-area\");\n    fileInput.addEventListener(\"change\", function () {\n      if (fileInput.files && fileInput.files.length) show(fileArea);else hide(fileArea);\n      showError(\"landing-file-error\", \"\");\n    });\n    getEl(\"landing-file-decrypt\").addEventListener(\"click\", decryptAndLoadFile);\n  }\n  function run() {\n    var lib = typeof window !== \"undefined\" && window.dkeyLib || null;\n    DkeyUserProfile = lib && lib.DkeyUserProfile || lib && lib.default && lib.default.DkeyUserProfile || null;\n    if (document.readyState === \"loading\") {\n      document.addEventListener(\"DOMContentLoaded\", initLanding);\n    } else {\n      initLanding();\n    }\n  }\n  run();\n})();\n\n//# sourceURL=webpack:///./index.js?");

/***/ })

/******/ });