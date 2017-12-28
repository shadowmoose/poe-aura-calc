class Gem{
	constructor(name, mods, level_array){
		this.name = name;
		this.mods = mods;
		this.level_array = level_array;
	}

	level_stats(level){
		let lvl = level;//Math.max(1, Math.min(this.level_array.length, level));
		console.log(this.name, '  level: ', lvl);
		let stats = this.level_array[lvl]['stats'];
		let ret = {};
		this.mods.forEach((stat, idx)=>{
			let val = stats[idx];
			if(val)val = val['value'];

			let name = stat['id'];
			if(name) {
				ret[name] = val;
				//console.log(idx, name, val);
			}
		});
		let groups = Gem.group_stats(ret);
		//console.log(groups);

		let final = Gem.convert_to_pob(groups);
		console.log(final);
		return final;
	}


	static group_stats(stats){
		/** Bundles similar ("min"/"max") stats together as groups. */
		let groups = {};
		Object.keys(stats).forEach((key)=> {
			let st = key.replace('minimum', '?').replace('maximum', '?');
			if(!groups[st])
				groups[st] = [];
			groups[st].push(stats[key]);
		});
		return groups;
	}


	static convert_internal_name(str){
		if(Gem.match(str, 'active', 'skill', 'radius'))
			return false;
		if(Gem.match(str, 'deal', 'no', 'damage'))
			return false;
		if(Gem.match(str, 'duration'))
			return false;

		if(Gem.match(str, Gem.spell_or_attack(str), 'added', 'damage')){
			return 'Adds # to # '+Gem.get_type(str)+' Damage to '+Gem.spell_or_attack(str)+'s';
		}

		if(Gem.match(str, 'mana', 'regen', 'minute')){
			return '!# Mana Regenerated per Second';
		}

		if(Gem.match(str, 'base', 'resistance')){
			let max = Gem.match(str, '?')? 'maximum ':'';
			return '+#% to '+max+Gem.get_type(str)+' Resistance';
		}

		console.log('Unknown internal stat name:', str);
		return str+' [#]';
	}


	static convert_to_pob(grouped_stats){
		let final = [];
		Object.keys(grouped_stats).forEach((key)=> {
			let val_array = grouped_stats[key];
			let out = this.convert_internal_name(key);
			if(!out)return;
			val_array.forEach((val)=>{
				if(out.includes('!'))val = val/60;
				out = out.replace('!','');
				var rounded = Math.round( val * 10 ) / 10;
				out = out.replace('#', rounded);
			});
			final.push(out);
		});
		return final;
	}


	static match(){
		/** Check if the given string contains the following substrings. */
		let args = arguments;
		let str = args[0].toLowerCase();
		for(let i=0; i<args.length;i++){
			if(!str.includes(args[i].toLowerCase()))
				return false;
		}
		return true;
	}


	static get_type(str){
		/** Get the type of damage from the given str, if any. **/
		let types = ['Fire', 'Lightning', 'Cold', 'Physical', 'Chaos'];
		let ret = 'Unknown';
		types.forEach((ty)=>{
			if(str.toLowerCase().includes(ty.toLowerCase()))ret = ty;
		});
		return ret;
	}


	static spell_or_attack(str){
		if(str.toLowerCase().includes('spell'))
			return 'Spell';
		if(str.toLowerCase().includes('attack'))
			return 'Attack';
		return 'unknown';
	}
}

class Data {
	constructor() {
		this.source_url = 'https://raw.githubusercontent.com/brather1ng/RePoE/master/data/gems.json';
		this.data = {};
		this.gems = [];
		this.download();
	}


	download(){
		$.getJSON(this.source_url, function(resp){
			this.data = resp;

			Object.keys(this.data).forEach((key)=> {
				let ele = this.data[key];
				let base_item = ele['base_item'];
				if (!ele['tags'] || !ele['tags'].includes('aura') || ele['tags'].includes('support') )
					return;
				if(base_item['release_state'] !== 'released')
					return;
				this.gems.push(new Gem(base_item['display_name'], ele['static']['stats'], ele['per_level']));
				console.log(base_item['display_name']);
			});
			console.log(this.gems);
			this.gems.forEach((gem, idx)=>{
				gem.level_stats(20);
			})
		}.bind(this));
	}
}