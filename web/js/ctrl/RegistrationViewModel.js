"use strict";

tutao.provide('tutao.tutanota.ctrl.RegistrationViewModel');

/**
 * The ViewModel for the registration template.
 * @constructor
 */
tutao.tutanota.ctrl.RegistrationViewModel = function() {
	tutao.util.FunctionUtils.bindPrototypeMethodsToThis(this);

    this.pageStatus = ko.observable(tutao.tutanota.ctrl.RegistrationViewModel.PAGE_STATUS_LOADING);
    // if registration shall be deactivated for specific devices, use the following line
    // this.pageStatus(tutao.tutanota.ctrl.RegistrationViewModel.PAGE_STATUS_NOT_SUPPORTED);
	this.authToken = ko.observable("");
	this.accountType = ko.observable("0"); // set to invalid account type for indicating that the account type is not known
	this.companyName = ko.observable("");
	this.domain = ko.observable("tutanota.de");
	this.name = ko.observable("");

	this.mobileNumber = ko.observable("");
    this.mobileNumberStatus = ko.observable({ type: "neutral", text: "mobileNumberNeutral_msg" });
    this.lastCheckedNumber = null;
    this.mobileNumber.subscribe(function(newValue) {
        if (newValue == "") {
            this.lastCheckedNumber = null;
            this.mobileNumberStatus({ type: "neutral", text: "mobileNumberNeutral_msg" });
        } else  if (newValue.substring(0, 1) != "+") {
            this.lastCheckedNumber = null;
            this.mobileNumberStatus({ type: "invalid", text: "mobileNumberNoCountryCode_msg" });
        } else if (this.lastCheckedNumber != newValue) {
            this.lastCheckedNumber = newValue;
            var cleaned = tutao.tutanota.util.Formatter.getCleanedPhoneNumber(newValue);
            if (cleaned == null) {
                this.mobileNumberStatus({ type: "invalid", text: "mobileNumberInvalid_msg" });
            } else {
                var self = this;
                tutao.entity.sys.PhoneNumberTypeReturn.load(new tutao.entity.sys.PhoneNumberTypeData().setPhoneNumber(cleaned), {}, []).then(function(result) {
                    if (result.getType() == tutao.entity.tutanota.TutanotaConstants.PHONE_NUMBER_TYPE_MOBILE || result.getType() == tutao.entity.tutanota.TutanotaConstants.PHONE_NUMBER_TYPE_UNKNOWN) {
                        self.mobileNumberStatus({ type: "valid", text: "mobileNumberValid_msg" });
                    } else {
                        self.mobileNumberStatus({ type: "invalid", text: "mobileNumberInvalid_msg" });
                    }
                });
            }
        }
    }, this);

	this.mailAddressPrefix = ko.observable("");
	this.mailAddressStatus = ko.observable({ type: "neutral", text: "mailAddressNeutral_msg"});
	
	this.code = ko.observable("");
	this.password1 = ko.observable("");
	this.password2 = ko.observable("");
	this.termsAccepted = ko.observable(false);

	this.oldName = "";
	this.name.subscribe(function(newValue) {
		if ((this.mailAddressPrefix() == "" || this.mailAddressPrefix().toLowerCase() == this._getMailAddressFromName(this.oldName)) && this.name() != "") {
			this.mailAddressPrefix(this._getMailAddressFromName(this.name()));
		} else if (this.mailAddressPrefix().toLowerCase() == this._getMailAddressFromName(this.oldName) && this.name() == "") {
			this.mailAddressPrefix("");
		}
		this.oldName = newValue;
	}, this);

	this.joinStatus = ko.observable({ type: "neutral", text: "joinNeutral_msg" });

	/**
	 * Must be called when the code was changed (directly after each character).
	 */
	this.code.subscribe(function(newValue) {
		if (newValue.length == 4) {
			if (this.codeVerificationFailed()) {
				this.codeInputStatus({ type: "invalid", text: "codeInvalid_msg" });
			} else {
				this.codeInputStatus({ type: "valid", text: "codeValid_msg" });
			}
		} else {
			this.codeInputStatus({ type: "neutral", text: "codeNeutralEnterCode_msg" });
		}
	}, this);

	this.codeInputStatus = ko.observable({ type: "neutral", text: "codeNeutralEnterCode_msg" });
	this.createAccountStatus = ko.observable({ type: "neutral", text: "emptyString_msg" });

	this._keyGenProgress = ko.observable(0);

	this._sendSmsState = ko.observable(tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_NOT_RUNNING);
	this._createAccountState = ko.observable(tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_NOT_RUNNING);

	this._wrongCodes = ko.observableArray([]);
};

tutao.tutanota.ctrl.RegistrationViewModel.PAGE_STATUS_OK = 0;
tutao.tutanota.ctrl.RegistrationViewModel.PAGE_STATUS_INVALID_LINK = 1;
tutao.tutanota.ctrl.RegistrationViewModel.PAGE_STATUS_LOADING = 2;
tutao.tutanota.ctrl.RegistrationViewModel.PAGE_STATUS_NOT_SUPPORTED = 3;
tutao.tutanota.ctrl.RegistrationViewModel.PAGE_STATUS_DISABLED = 4;

tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_NOT_RUNNING = 0;
tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_RUNNING = 1;
tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_FINISHED = 2;

tutao.tutanota.ctrl.RegistrationViewModel.MINIMUM_MAIL_ADDRESS_PREFIX_LENGTH = 4;

tutao.tutanota.ctrl.RegistrationViewModel.prototype.activate = function(authToken) {
    var self = this;

    if (this.pageStatus() == tutao.tutanota.ctrl.RegistrationViewModel.PAGE_STATUS_NOT_SUPPORTED) {
        return;
    }
    // setting the focus into the name field here with knockout focus binding results in too small scrollable registration div

    self._activate(authToken);
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype._activate = function(authToken) {
    var self = this;
    if (authToken) {
        this.authToken(authToken);
        var params = {};
        params[tutao.rest.ResourceConstants.AUTH_ID_PARAMETER_NAME] = authToken;
        tutao.entity.sys.RegistrationServiceData.load(params, null).then(function(data) {
            self.accountType(data.getAccountType());
            if (self.accountType() == tutao.entity.tutanota.TutanotaConstants.ACCOUNT_TYPE_FREE) {
                self.mailAddressPrefix.subscribe(self._verifyMailAddressFree, this);
            } else {
                self.mailAddressPrefix.subscribe(self._verifyMailAddressStarter, this);
            }
            self.domain(data.getDomain());
            self.companyName(data.getCompany());
            self.name(data.getGroupName());
            self.mailAddressPrefix(data.getMailAddress().substring(0, data.getMailAddress().indexOf("@")));
            self.mobileNumber(data.getMobilePhoneNumber());
            self.pageStatus(tutao.tutanota.ctrl.RegistrationViewModel.PAGE_STATUS_OK);
        }).caught(tutao.NotFoundError, function (exception) {
            self.pageStatus(tutao.tutanota.ctrl.RegistrationViewModel.PAGE_STATUS_INVALID_LINK);
        }).caught(tutao.BadRequestError, function (exception) {
            self.pageStatus(tutao.tutanota.ctrl.RegistrationViewModel.PAGE_STATUS_INVALID_LINK);
        });
    } else {
        var parameters = {};
        tutao.entity.sys.RegistrationConfigReturn.load(parameters, null).then(function(registrationConfigReturn) {
            if (registrationConfigReturn.getFreeEnabled()) {
                self.accountType(tutao.entity.tutanota.TutanotaConstants.ACCOUNT_TYPE_FREE);
                self.mailAddressPrefix.subscribe(self._verifyMailAddressFree, self);
                self.pageStatus(tutao.tutanota.ctrl.RegistrationViewModel.PAGE_STATUS_OK);
            } else {
                self.pageStatus(tutao.tutanota.ctrl.RegistrationViewModel.PAGE_STATUS_DISABLED);
            }
        });

    }
};



tutao.tutanota.ctrl.RegistrationViewModel.prototype.getRegistrationType = function() {
    if (this.accountType() == tutao.entity.tutanota.TutanotaConstants.ACCOUNT_TYPE_FREE) {
		return 'Free';
	} else if (this.accountType() == tutao.entity.tutanota.TutanotaConstants.ACCOUNT_TYPE_STARTER) {
		return 'Starter';
	} else {
        return ''; // unknown account type
    }
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype._getMailAddressFromName = function(name) {
	var mailAddress = name;
	mailAddress = mailAddress.trim().toLowerCase();
	mailAddress = mailAddress.replace(/ /g, ".");
	mailAddress = mailAddress.replace(/ö/g, "oe");
	mailAddress = mailAddress.replace(/ä/g, "ae");
	mailAddress = mailAddress.replace(/ü/g, "ue");
	mailAddress = mailAddress.replace(/ß/g, "ss");
	return mailAddress;
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.isMobileNumberValid = function() {
    return (this.mobileNumberStatus().type == "valid");
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.isValidMailAddress = function() {
    return tutao.tutanota.util.Formatter.isMailAddress(this.getMailAddress());
};

/**
 * Provides the status of the first entered new password.
 * @return {Object} The status containing type and text id.
 */
tutao.tutanota.ctrl.RegistrationViewModel.prototype.getPassword1Status = function() {
	if (this.password1() == "") {
		return { type: "neutral", text: "password1Neutral_msg" };
	} else if (this.getPasswordStrength() >= 80) {
		return { type: "valid", text: "passwordValid_msg" };
	} else {
		return { type: "invalid", text: "password1InvalidUnsecure_msg" };
	}
};

/**
 * Provides the status of the second entered new password.
 * @return {Object} The status containing type and text id.
 */
tutao.tutanota.ctrl.RegistrationViewModel.prototype.getPassword2Status = function() {
	if (this.password2() == "") {
		return { type: "neutral", text: "password2Neutral_msg" };
	} else if (this.password1() == this.password2()) {
		return { type: "valid", text: "passwordValid_msg" };
	} else {
		return { type: "invalid", text: "password2Invalid_msg" };
	}
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.getPasswordStrength = function() {
	return tutao.tutanota.util.PasswordUtils.getPasswordStrength(this.password1(), [this.name(), this.mailAddressPrefix(), this.companyName(), this.domain()]);
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.getTermsStatus = function() {
	if (!this.termsAccepted()) {
		return { type: "neutral", text: "termsAcceptedNeutral_msg" };
	} else {
		return { type: "valid", text: "emptyString_msg" };
	}
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.getKeyGenerationProgress = function() {
	return this._keyGenProgress();
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.getSendSmsState = function() {
	return this._sendSmsState();
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.isFormEditable = function() {
	return (this.getSendSmsState() != tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_RUNNING);
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.isSendSmsPossible = function() {
	return ((this._sendSmsState() != tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_RUNNING) &&
			(this._createAccountState() == tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_NOT_RUNNING) &&
		(this.mailAddressStatus().type == "valid") &&
		this.isMobileNumberValid() &&
		(this.getPassword1Status().type == "valid") &&
		(this.getPassword2Status().type == "valid") &&
		this.termsAccepted());
};

// STEP 2

tutao.tutanota.ctrl.RegistrationViewModel.prototype.getCreateAccountState = function() {
	return this._createAccountState();
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.isCreateAccountPossible = function() {
	return (this._sendSmsState() == tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_FINISHED &&
			(this._createAccountState() == tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_NOT_RUNNING) &&
			this.code().length == 4 &&
			!this.codeVerificationFailed());
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.isBackPossible = function() {
	return (this._sendSmsState() == tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_FINISHED &&
			(this._createAccountState() == tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_NOT_RUNNING) &&
			!this.codeVerificationFailed());
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.isCreatingAccount = function() {
	return this._createAccountState() == tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_RUNNING;
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.codeVerificationFailed = function() {
	return tutao.util.ArrayUtils.contains(this._wrongCodes(), this.code());
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.sendSms = function() {
	var self = this;
	if (!this.isSendSmsPossible()) {
		return;
	}
	this._sendSmsState(tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_RUNNING);
	self.joinStatus({ type: "neutral", text: "joinRunning_msg" });
	var service = new tutao.entity.sys.SendRegistrationCodeData()
	    .setAccountType(this.accountType())
	    .setAuthToken(this.authToken())
        .setLanguage(tutao.locator.languageViewModel.getCurrentLanguage())
	    .setMobilePhoneNumber(tutao.tutanota.util.Formatter.getCleanedPhoneNumber(this.mobileNumber()));
	// if no registration link was used, the authToken is not set yet, but returned by the send registration code service
	service.setup({}, null).then(function(sendRegistrationCodeReturn) {
        self.authToken(sendRegistrationCodeReturn.getAuthToken());
        self.joinStatus({ type: "neutral", text: "joinNeutral_msg" });
        self.code(""); // reset the code input field because it might be filled if the user changed back to the first view
        self._sendSmsState(tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_FINISHED);
	}).caught(tutao.LimitReachedError, function (e) {
        self.joinStatus({ type: "invalid", text: "joinAccountLimitReached_msg" });
    }).caught(function (e) {
        self.joinStatus({ type: "neutral", text: "joinNeutral_msg" });
        self._sendSmsState(tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_NOT_RUNNING);
        throw e;
    });
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.createAccount = function() {
	var self = this;
	if (!this.isCreateAccountPossible()) {
		return;
	}
	self._createAccountState(tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_RUNNING);
	self.createAccountStatus({ type: "neutral", text: "createAccountRunning_msg" });
	var service = new tutao.entity.sys.VerifyRegistrationCodeData();
	service.setAuthToken(this.authToken());
	service.setCode(this.code());
	return service.setup({}, null).then(function(voidReturn) {
        self.generateKeys();
	}).caught(tutao.InvalidDataError, function(exception) {
        self._createAccountState(tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_NOT_RUNNING);
        self.codeInputStatus({ type: "invalid", text: "codeInvalid_msg" });
        self.createAccountStatus({ type: "neutral", text: "emptyString_msg" });
        self._wrongCodes.push(self.code());
    }).caught(tutao.TooManyRequestsError, function(e) {
        self._createAccountState(tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_FINISHED);
        self.createAccountStatus({ type: "invalid", text: "createAccountTooManyAttempts_msg" });
    }).caught(tutao.LimitReachedError, function(e) {
        self._createAccountState(tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_NOT_RUNNING);
        self.createAccountStatus({ type: "invalid", text: "createAccountTooManyAccountsError_msg" });
    }).caught(function(e) {
        self._createAccountState(tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_NOT_RUNNING);
        self.createAccountStatus({ type: "neutral", text: "emptyString_msg" });
        throw e;
    });
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.backToStartPage = function() {
	if (this.isCreatingAccount()) {
		return;
	}
	this._sendSmsState(tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_NOT_RUNNING);
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.generateKeys = function() {
	var self = this;
	self.createAccountStatus({ type: "neutral", text: "createAccountRunning_msg" });
	tutao.locator.entropyCollector.fetchMissingEntropy(function() {
		self._generateKeys().then(function() {
            tutao.locator.navigator.logout(false, false); // the user is still logged in at this moment. This is why the navigator will re-initialize the whole application.
            setTimeout(function() {
                tutao.locator.loginViewModel.setMailAddress(self.getMailAddress());
                tutao.locator.loginViewModel.setWelcomeTextId("afterRegistration_msg");
            }, 0);
		}).caught(tutao.LimitReachedError, function (exception) {
            self.createAccountStatus({ type: "invalid", text: "createAccountTooManyAccountsError_msg" });
        }).caught(function (e) {
            self.createAccountStatus({ type: "neutral", text: "emptyString_msg" });
            throw e;
        }).lastly(function() {
            self._keyGenProgress(0);
            self._createAccountState(tutao.tutanota.ctrl.RegistrationViewModel.PROCESS_STATE_NOT_RUNNING);
        });
	});
};

/**
 *
 * @param {tutao.entity.sys.SystemKeysReturn} keyData
 * @returns {string} the group key for the current account type
 * @private
 */
tutao.tutanota.ctrl.RegistrationViewModel.prototype._getAccountGroupKey = function (keyData) {
    if (this.accountType() == tutao.entity.tutanota.TutanotaConstants.ACCOUNT_TYPE_FREE) {
        return keyData.getFreeGroupKey();
    } else if (this.accountType() == tutao.entity.tutanota.TutanotaConstants.ACCOUNT_TYPE_STARTER) {
        return keyData.getStarterGroupKey();
    } else {
        throw Error("Illegal account type");
    }
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype._generateKeys = function() {
	var self = this;
	return tutao.entity.sys.SystemKeysReturn.load({}, null).then(function(keyData) {
		var systemAdminPubKeyBase64 = keyData.getSystemAdminPubKey();
		var systemAdminPubKeyVersion = keyData.getSystemAdminPubKeyVersion();

		var salt = tutao.locator.kdfCrypter.generateRandomSalt();
		return tutao.locator.kdfCrypter.generateKeyFromPassphrase(self.password1(), salt).then(function(userPassphraseKeyHex) {
			self._keyGenProgress(5);
			var userPassphraseKey = tutao.locator.aesCrypter.hexToKey(userPassphraseKeyHex);

            var adminGroupsListKey = tutao.locator.aesCrypter.generateRandomKey();
			return tutao.tutanota.ctrl.GroupData.generateGroupKeys("admin", "", null, null, adminGroupsListKey).spread(function(adminGroupData, adminGroupKey) {
				self._keyGenProgress(35);
                var userGroupsListKey = tutao.locator.aesCrypter.generateRandomKey();
				return tutao.tutanota.ctrl.GroupData.generateGroupKeys(self.name(), self.getMailAddress(), userPassphraseKey, adminGroupKey, userGroupsListKey).spread(function(userGroupData, userGroupKey) {
					self._keyGenProgress(65);
					// encrypt the admin key with the user key, because the user key was not available before
					adminGroupData.setSymEncGKey(tutao.locator.aesCrypter.encryptKey(userGroupKey, adminGroupKey));

                    var customerGroupsListKey = tutao.locator.aesCrypter.generateRandomKey();
					return tutao.tutanota.ctrl.GroupData.generateGroupKeys("customer", "", userGroupKey, adminGroupKey, customerGroupsListKey).spread(function(customerGroupData, customerGroupKey) {
						self._keyGenProgress(95);
                        var accountingInfoSessionKey = tutao.locator.aesCrypter.generateRandomKey();
						var accountingInfoBucketKey = tutao.locator.aesCrypter.generateRandomKey();

						var clientKey = tutao.locator.aesCrypter.generateRandomKey();

						var symEncAccountGroupKey = tutao.locator.aesCrypter.encryptKey(userGroupKey, tutao.locator.aesCrypter.hexToKey(tutao.util.EncodingConverter.base64ToHex(self._getAccountGroupKey(keyData))));

						var systemAdminPubKey = tutao.locator.rsaCrypter.hexToKey(tutao.util.EncodingConverter.base64ToHex(systemAdminPubKeyBase64));

                        return new Promise(function(resolve, reject) {
                            tutao.locator.rsaCrypter.encryptAesKey(systemAdminPubKey, tutao.locator.aesCrypter.keyToHex(accountingInfoBucketKey), function(systemAdminPubEncCustomerBucketKey, exception) {
                                self._keyGenProgress(97);
                                if (exception) {
                                    reject(exception);
                                    return;
                                }

                                var teamGroupsListKey = tutao.locator.aesCrypter.generateRandomKey();

                                var customerService = new tutao.entity.sys.CustomerData();
                                customerService.setAuthToken(self.authToken())
                                    .setCompany(self.companyName())
                                    .setDomain(self.domain())
                                    .setAdminGroupList(new tutao.entity.sys.CreateGroupListData(customerService)
                                        .setCustomerEncGroupInfoListKey(tutao.locator.aesCrypter.encryptKey(customerGroupKey, adminGroupsListKey))
                                        .setAdminEncGroupInfoListKey(tutao.locator.aesCrypter.encryptKey(adminGroupKey, adminGroupsListKey))
                                        .setCreateGroupData(adminGroupData))
                                    .setUserGroupList(new tutao.entity.sys.CreateGroupListData(customerService)
                                        .setCustomerEncGroupInfoListKey(tutao.locator.aesCrypter.encryptKey(customerGroupKey, userGroupsListKey))
                                        .setAdminEncGroupInfoListKey(tutao.locator.aesCrypter.encryptKey(adminGroupKey, userGroupsListKey))
                                        .setCreateGroupData(userGroupData))
                                    .setCustomerGroupList(new tutao.entity.sys.CreateGroupListData(customerService)
                                        .setCustomerEncGroupInfoListKey(tutao.locator.aesCrypter.encryptKey(customerGroupKey, customerGroupsListKey))
                                        .setAdminEncGroupInfoListKey(tutao.locator.aesCrypter.encryptKey(adminGroupKey, customerGroupsListKey))
                                        .setCreateGroupData(customerGroupData))
                                    .setTeamGroupList(new tutao.entity.sys.CreateGroupListData(customerService)
                                        .setCustomerEncGroupInfoListKey(tutao.locator.aesCrypter.encryptKey(customerGroupKey, teamGroupsListKey))
                                        .setAdminEncGroupInfoListKey(tutao.locator.aesCrypter.encryptKey(adminGroupKey, teamGroupsListKey)))

                                    .setAdminEncAccountingInfoSessionKey(tutao.locator.aesCrypter.encryptKey(adminGroupKey, accountingInfoSessionKey))
                                    .setUserEncClientKey(tutao.locator.aesCrypter.encryptKey(userGroupKey, clientKey))
                                    .setAccountingInfoBucketEncAccountingInfoSessionKey(tutao.locator.aesCrypter.encryptKey(accountingInfoBucketKey, accountingInfoSessionKey))
                                    .setSystemCustomerPubEncAccountingInfoBucketKey(systemAdminPubEncCustomerBucketKey)
                                    .setSystemCustomerPubKeyVersion(systemAdminPubKeyVersion)
                                    .setSalt(tutao.util.EncodingConverter.hexToBase64(salt))
                                    .setVerifier(tutao.locator.shaCrypter.hashHex(userPassphraseKeyHex))
                                    .setSymEncAccountGroupKey(symEncAccountGroupKey);

                                resolve(customerService.setup({}, null).then(function(adminUserData) {
                                    return tutao.locator.userController.loginUser(userGroupData.getMailAddress(), self.password1()).then(function() {
                                        //TODO (before release) create root instances and welcome mail before next login if it failed here
                                        return tutao.tutanota.ctrl.AdminNewUser.initGroup(adminUserData.getAdminUserGroup(), userGroupKey).then(function() {
                                            if (self.accountType() == tutao.entity.tutanota.TutanotaConstants.ACCOUNT_TYPE_FREE) {
                                                new tutao.entity.tutanota.WelcomeMailData()
                                                    .setLanguage(tutao.locator.languageViewModel.getCurrentLanguage())
                                                    .setup({}, tutao.entity.EntityHelper.createAuthHeaders(), function() {});
                                            }
                                            self._keyGenProgress(100);
                                        });
                                    });
                                }));
                            });
                        });

					});
				});
			});
		});
	});
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype._verifyMailAddressFree = function(newValue) {
	var self = this;
    var cleanedValue = newValue.toLowerCase();
    if (self.mailAddressPrefix().length < tutao.tutanota.ctrl.RegistrationViewModel.MINIMUM_MAIL_ADDRESS_PREFIX_LENGTH) {
        self.mailAddressStatus({ type: "invalid", text: "mailAddressInvalid_msg"});
        return;
    } else if (!self.isValidMailAddress()) {
        self.mailAddressStatus({ type: "invalid", text: "mailAddressInvalid_msg"});
        return;
    }

    self.mailAddressStatus({ type: "invalid", text: "mailAddressBusy_msg"});

    setTimeout(function() {
        if (self.mailAddressPrefix() == newValue) {
            var params = [];
            tutao.entity.sys.MailAddressAvailabilityReturn.load(new tutao.entity.sys.MailAddressAvailabilityData().setMailAddress(cleanedValue + "@" + self.domain()), params, []).then(function(mailAddressAvailabilityReturn) {
                if (self.mailAddressPrefix() == newValue) {
                    if (mailAddressAvailabilityReturn.getAvailable()) {
                        self.mailAddressStatus({ type: "valid", text: "mailAddressAvailable_msg"});
                    } else {
                        self.mailAddressStatus({ type: "invalid", text: "mailAddressNA_msg"});
                    }
                }
            }).caught(tutao.AccessDeactivatedError, function (exception) {
                self.mailAddressStatus({ type: "invalid", text: "mailAddressDelay_msg"});
            });
        }
    }, 500);
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype._verifyMailAddressStarter = function(newValue) {
    var cleanedValue = newValue.toLowerCase();
    if (this.isValidMailAddress()) {
        this.mailAddressStatus({ type: "valid", text: "mailAddressAvailable_msg"})
    } else {
        this.mailAddressStatus({ type: "invalid", text: "mailAddressInvalid_msg"});
    }
};

tutao.tutanota.ctrl.RegistrationViewModel.prototype.getMailAddress = function () {
    return tutao.tutanota.util.Formatter.getCleanedMailAddress(this.mailAddressPrefix() + "@" + this.domain());
};

