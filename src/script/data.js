class Gem{
	constructor(name, mods, level_array){
		this.name = name;
		this.mods = mods;
		this.level_array = level_array;
	}


	/** Returns an array of formatted text lines, showing this aura's effects at the given level. */
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

	/** Bundles similar ("min"/"max") stats together as groups. */
	static group_stats(stats){
		let groups = {};
		Object.keys(stats).forEach((key)=> {
			let st = key.replace('minimum', '?').replace('maximum', '?');
			if(!groups[st])
				groups[st] = [];
			groups[st].push(stats[key]);
		});
		return groups;
	}

	/** Convert internal Names into formatted strings. **/
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

		if(Gem.match(str, 'determination')){
			return '#% more Armour';
		}

		if(Gem.match(str, 'energy', 'shield', 'base')){
			return '+# to maximum Energy Shield';
		}

		if(Gem.match(str, 'energy', 'shield', 'recharge', 'rate')){
			return false;
		}

		if(Gem.match(str, 'evasion', 'rating')){
			return '+# to Evasion Rating';
		}

		if(Gem.match(str, "speed", 'attack')){
			return "#% increased Attack Speed";
		}

		if(Gem.match(str, "speed", 'cast')){
			return "#% increased Cast Speed";
		}

		if(Gem.match(str, "movement", 'velocity')){
			return "#% increased Movement Speed";
		}

		if(Gem.match(str, "add", "as", "cold")){
			return "#% of Physical Damage added as Cold Damage";
		}

		if(Gem.match(str, "resist", "all", "elements")){
			return "+#% to all Elemental Resistances";
		}

		if(Gem.match(str, 'not', 'delayed', 'damage')){
			return false;
		}

		if(Gem.match(str, 'no', 'mana', 'cost')){
			return false;
		}

		if(Gem.match(str, 'chance', 'to', 'dodge')){
			let spells = Gem.match(str, 'spells');
			return '#% chance to Dodge '+(spells?'Spell Damage':'Attacks');
		}

		if(Gem.match(str, 'life', 'regeneration', 'minute')){
			return '!#% of Life Regenerated per Second';
		}

		if(Gem.match(str, 'spell', 'lightning', 'damage', 'final')){
			return '#% more Lightning Damage with Spells';
		}

		console.log('Unknown internal stat name:', str);
		return str+' [#]';
	}


	/** Convert this Aura Gem into a Path of Building-friendly string. */
	static convert_to_pob(grouped_stats){
		let final = [];
		Object.keys(grouped_stats).forEach((key)=> {
			let val_array = grouped_stats[key];
			let out = this.convert_internal_name(key);
			if(!out)return;
			val_array.forEach((val)=>{
				if(out.includes('!'))val = val/60;
				out = out.replace('!','');
				let rounded = Math.round( val * 100 ) / 100;
				out = out.replace('#', rounded);
				if(rounded === 0)out = false;
			});
			if(out)
				final.push(out);
		});
		return final;
	}

	/** Check if the given string contains the following substrings. */
	static match(){
		let args = arguments;
		let str = args[0].toLowerCase();
		for(let i=0; i<args.length;i++){
			if(!str.includes(args[i].toLowerCase()))
				return false;
		}
		return true;
	}

	/** Get the type of damage from the given str, if any. **/
	static get_type(str){
		let types = ['Fire', 'Lightning', 'Cold', 'Physical', 'Chaos'];
		let ret = 'Unknown';
		types.forEach((ty)=>{
			if(str.toLowerCase().includes(ty.toLowerCase()))ret = ty;
		});
		return ret;
	}


	/** Determine if this string is for a spell or an attack, and return the name. **/
	static spell_or_attack(str){
		if(str.toLowerCase().includes('spell'))
			return 'Spell';
		if(str.toLowerCase().includes('attack'))
			return 'Attack';
		return 'Unknown';
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
				if (!ele['tags'] ||
					!ele['tags'].includes('aura') ||
					ele['tags'].includes('support') ||
					ele['tags'].includes('totem'))
					return;
				if(base_item['release_state'] !== 'released')
					return;
				this.gems.push(new Gem(base_item['display_name'], ele['static']['stats'], ele['per_level']));
				console.log(base_item['display_name']);
			});

			console.log(this.gems);
			this.gems = this.gems.sort(function(a, b) {
				let nameA = a.name.toUpperCase(); // ignore upper and lowercase
				let nameB = b.name.toUpperCase(); // ignore upper and lowercase
				if (nameA < nameB) {
					return -1;
				}
				if (nameA > nameB) {
					return 1;
				}
				return 0;
			});
			this.gems.forEach((gem)=>{
				let stats = gem.level_stats(20);
				if(stats.length>0){
					let out = '';
					out+= '<b>'+gem.name+'</b>';
					stats.forEach((txt)=>{
						out+="<br>"+txt;
					});
					let cont = $("<div>").addClass('stat_block');
					cont.html(out);
					$("#output").append(cont);
				}
			})
		}.bind(this));
	}
}