exports = module.exports = Migration;

function Migration() {
	//
}

Migration.prototype.up = function() {
	this.models._sql('500fa8908cd726bed18e116c04fb7b84', [
		'CREATE OR REPLACE FUNCTION publishUser() RETURNS trigger AS $$',
		'BEGIN',
		'	IF TG_OP = \'INSERT\' OR TG_OP = \'UPDATE\' THEN',
		'		PERFORM pg_notify(\'User\', json_build_object(\'type\', TG_OP, \'row\', row_to_json(NEW))::text);',
		'		RETURN NEW;',
		'	ELSE',
		'		PERFORM pg_notify(\'User\', json_build_object(\'type\', TG_OP, \'row\', row_to_json(OLD))::text);',
		'		RETURN OLD;',
		'	END IF;',
		'END;',
		'$$ LANGUAGE plpgsql;',
		'',
		'CREATE TRIGGER users_notify_update AFTER UPDATE ON users FOR EACH ROW EXECUTE PROCEDURE publishUser();',
		'CREATE TRIGGER users_notify_insert AFTER INSERT ON users FOR EACH ROW EXECUTE PROCEDURE publishUser();',
		'CREATE TRIGGER users_notify_delete AFTER DELETE ON users FOR EACH ROW EXECUTE PROCEDURE publishUser();'
	].join('\n'));
	this.models._sql('aefca65d5e4f85e3762381d5d2ff4a3a', [
		'CREATE OR REPLACE FUNCTION publishMessage() RETURNS trigger AS $$',
		'BEGIN',
		'	IF TG_OP = \'INSERT\' OR TG_OP = \'UPDATE\' THEN',
		'		PERFORM pg_notify(\'Message\', json_build_object(\'type\', TG_OP, \'row\', row_to_json(NEW))::text);',
		'		RETURN NEW;',
		'	ELSE',
		'		PERFORM pg_notify(\'Message\', json_build_object(\'type\', TG_OP, \'row\', row_to_json(OLD))::text);',
		'		RETURN OLD;',
		'	END IF;',
		'END;',
		'$$ LANGUAGE plpgsql;',
		'',
		'CREATE TRIGGER messages_notify_update AFTER UPDATE ON messages FOR EACH ROW EXECUTE PROCEDURE publishMessage();',
		'CREATE TRIGGER messages_notify_insert AFTER INSERT ON messages FOR EACH ROW EXECUTE PROCEDURE publishMessage();',
		'CREATE TRIGGER messages_notify_delete AFTER DELETE ON messages FOR EACH ROW EXECUTE PROCEDURE publishMessage();'
	].join('\n'));

};

Migration.prototype.down = function() {
	this.models._sql('500fa8908cd726bed18e116c04fb7b84', [
		'DROP TRIGGER users_notify_update ON users;',
		'DROP TRIGGER users_notify_insert ON users;',
		'DROP TRIGGER users_notify_delete ON users;'
	].join('\n'));
	this.models._sql('aefca65d5e4f85e3762381d5d2ff4a3a', [
		'DROP TRIGGER messages_notify_update ON messages;',
		'DROP TRIGGER messages_notify_insert ON messages;',
		'DROP TRIGGER messages_notify_delete ON messages;'
	].join('\n'));

};
