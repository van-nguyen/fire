'use strict';

exports = module.exports = API;

var fire = require('./../../firestarter');
var inflection = require('inflection');
var Q = require('q');

var debug = require('debug')('fire:api');

function API(app) {
	this.app = app;
}

API.prototype.setup = function() {
	debug('Setup API routes');

	var self = this;
	this.app.models.forEach(function(model, modelName) {
		self.createRoute(modelName, model);
	});
};

API.prototype.addModel = function(modelName, model) {
	return this.createRoute(modelName, model);
};

API.prototype.createRoute = function(modelName, model) {
	debug('Create route `' + modelName + '`.');

	var pluralName = inflection.pluralize(modelName);

	// TODO: Use a default controller and change paths with the Router.

	var ModelController = function() {};
	ModelController.name = modelName + 'ModelController';
	fire.controller(ModelController);

	ModelController.prototype.basePathComponents = ['api'];

	if(this.app.models.getAuthenticator()) {
		// TODO: Maybe we should not query our authenticator _every_ request?
		ModelController.prototype.configure = function() {
			debug('Configuring controller.');
		};

		ModelController.prototype.before = function() {
			debug('ModelController#before.');
			debug(this.session.at);

			return this.findAuthenticator();
		};
	}

	var createFunctionName = 'create' + modelName;
	var readFunctionName = 'get' + modelName;
	var readManyFunctionName = 'get' + pluralName;
	var updateFunctionName = 'update' + modelName;
	var deleteFunctionName = 'delete' + modelName;

	if(model.isAuthenticator()) {
		ModelController.prototype.getMe = ['/api/' + pluralName + '/me', function() {
			if(this._authenticator) {
				return this._authenticator;
			}
			else {
				var error = new Error('Unauthorized');
				error.status = 401;
				throw error;
			}
		}];

		ModelController.prototype.doAuthorize = ['/api/' + pluralName + '/authorize', function() {
			debug('doAuthorize');

			// TODO: What if we're already authorized? Should we somehow disallow this? If so, we need a deauthorize method as well.

			var map = {};
			map[model.options.authenticatingProperty.name] = this.body[model.options.authenticatingProperty.name];

			// TODO: Do not hard code this property like this.
			map.password = this.body.password;

			var self = this;
			return model.getOne(map)
				.then(function(instance) {
					// TODO: Do not hardcode `accessToken` like this...
					self.session.at = instance.accessToken;
					return instance;
				})
				.catch(function(error) {
					throw error;
				});
		}];
	}

	ModelController.prototype[readManyFunctionName] = function() {
		var accessControl = model.getAccessControl();

		var self = this;
		return Q.when(accessControl.canRead(this._authenticator))
			.then(function(canRead) {
				if(canRead) {
					var queryMap = self.query || {};
					var optionsMap = {};

					if(queryMap.$options) {
						optionsMap = JSON.parse(queryMap.$options);
						delete queryMap.$options;
					}

					var readManyFunction = model[readManyFunctionName] || model.find;
					return readManyFunction.call(model, queryMap, optionsMap);
				}
				else {
					var error = new Error();

					if(self._authenticator) {
						error.status = 403;
						error.message = 'Forbidden';
					}
					else {
						error.status = 401;
						error.message = 'Unauthorized';
					}

					throw error;
				}
			});
	};

	ModelController.prototype[updateFunctionName] = function($id) {
		function _canUpdateProperties(propertyNames) {
			for(var i = 0, il = propertyNames.length; i < il; i++) {
				var propertyName = propertyNames[i];
				var property = model.getProperty(propertyName);

				// TODO: Implement function-based checks.
				if(property && typeof property.options.canUpdate != 'undefined' && !property.options.canUpdate) {
					return false;
				}
			}

			return true;
		}

		var accessControl = model.getAccessControl();

		var self = this;
		return Q.when(accessControl.getPermissionFunction('update')(this._authenticator))
			.then(function(canUpdate) {
				if(canUpdate) {
					var whereMap = {};

					var keyPath = accessControl.getPermissionKeyPath('update');
					if(keyPath) {
						if(!model.getProperty(keyPath)) {
							throw new Error('Invalid key path `' + keyPath + '`.');
						}

						// TODO: We need a way to resolve a key path if it references child properties via the dot syntax e.g. team.clients.
						whereMap[keyPath] = self._authenticator;
					}

					whereMap.id = $id;

					// Now check if we may update the properties we want to update.
					return Q.when(_canUpdateProperties(Object.keys(self.body)))
						.then(function(canUpdateProperties) {
							if(canUpdateProperties) {
								var updateFunction = model[updateFunctionName] || model.update;
								return updateFunction.call(model, whereMap, self.body)
									.then(function(instance) {
										if(instance) {
											return instance;
										}
										else {
											var error = new Error();

											if(self._authenticator) {
												error.status = 403;
												error.message = 'Forbidden';
											}
											else {
												error.status = 401;
												error.message = 'Unauthorized';
											}

											throw error;
										}
									});
							}
							else {
								var error = new Error();
								error.status = 400;
								error.message = 'Bad Request';
								throw error;
							}
						});
				}
				else {
					var error = new Error();

					if(self._authenticator) {
						error.status = 403;
						error.message = 'Forbidden';
					}
					else {
						error.status = 401;
						error.message = 'Unauthorized';
					}

					throw error;
				}
			})
			.catch(function(error) {
				console.log(error);

				throw error;
			});
	};

	ModelController.prototype[readFunctionName] = function($id) {
		var accessControl = model.getAccessControl();

		var self = this;
		return Q.when(accessControl.canRead(this._authenticator))
			.then(function(canRead) {
				if(canRead) {
					var readFunction = model[readFunctionName] || model.getOne;

					// TODO: read should also use all query params as additional where options
					return readFunction.call(model, {id: $id});
				}
				else {
					var error = new Error();

					if(self._authenticator) {
						error.status = 403;
						error.message = 'Forbidden';
					}
					else {
						error.status = 401;
						error.message = 'Unauthorized';
					}

					throw error;
				}
			});

	};

	// Create an instance of the model.
	// This check the access control if it's allowed to be created.
	// If an authenticator is created, it's access token is set to the session.
	// If an automatic property exists, it's set to the authenticator.
	ModelController.prototype[createFunctionName] = function() {
		var accessControl = model.getAccessControl();

		debug('Create ' + modelName);

		var self = this;
		return Q.when(accessControl.canCreate(this._authenticator))
			.then(function(canCreate) {
				debug('Can create ' + modelName + ': ' + canCreate);

				if(canCreate) {
					var createMap = self.body || {};
					if(model.options.automaticPropertyName) {
						debug('Setting automatic property.');

						// If a authenticator model does not exists there is some wrong.
						if(!self.models.getAuthenticator()) {
							throw new Error('Cannot find authenticator model. Did you define an authenticator via `PropertyTypes#Authenticate`?');
						}

						// This is definitely a bad request if the user tries to set the automatic property manually.
						if(createMap[model.options.automaticPropertyName]) {
							var error = new Error('Cannot set automatic property manually.');
							error.status = 400;
							throw error;
						}

						createMap[model.options.automaticPropertyName] = self._authenticator;
					}

					var createFunction = model[createFunctionName] || model.create;
					console.log(model);

					return createFunction.call(model, self.body)
						.then(function(instance) {
							if(model.isAuthenticator()) {
								self.session.at = instance.accessToken;
							}

							return instance;
						});
				}
				else {
					var error = new Error();

					if(self._authenticator) {
						error.status = 403;
						error.message = 'Forbidden';
					}
					else {
						error.status = 401;
						error.message = 'Unauthorized';
					}

					throw error;
				}
			})
			.catch(function(error) {
				console.log(error);

				throw error;
			});
	};

	ModelController.prototype[deleteFunctionName] = function($id) { //jshint ignore:line
		var error = new Error('Not Found');
		error.status = 404;
		throw error;
	};
};