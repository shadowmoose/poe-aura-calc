class Gem{
	constructor(name, mods, level_array){
		this.name = name;
		this.mods = mods;
		this.level_array = level_array;
	}


	/** Returns an array of formatted text lines, showing this aura's effects at the given level. */
	level_stats(level, increase){
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

		let final = Gem.convert_to_pob(groups, increase);
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
	static convert_to_pob(grouped_stats, increase){
		let final = [];
		Object.keys(grouped_stats).forEach((key)=> {
			let val_array = grouped_stats[key];
			let out = this.convert_internal_name(key);
			if(!out)return;
			val_array.forEach((val)=>{
				val = val*increase;
				if(out.includes('!'))val = val/60;
				out = out.replace('!','');
				let rounded = Math.floor(Math.round( val * 100 ) / 100);
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
		this.gem_info = {};

		this.decode_build();

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
			this.calculate();
		}.bind(this));
	}

	calculate(){
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
		$("#output").empty();
		$("#totals").html("<h2>Path of Building:</h2><h5>(Copy the below lines, 'Create Custom' in PoB under 'Items', "+
			"and paste it in) </h5>Auramancer<br>Crimson Jewel<br>Limited to: 1<br>"+
			"Implicits: 0<br>Quality: 20<br>LevelReq: 0<br>");

		let total_active = 0;
		let seed = 11;//random colors that persist.

		this.gems.forEach((gem)=>{
			if(!this.gem_info[gem.name]){
				console.log('built:', gem.name);
				this.gem_info[gem.name] = {
					'level':gem.name === 'Clarity'?1:20,
					'disabled':gem.name.includes('Vaal'),
					'generosity':0
				};
			}

			let percent_inc = parseInt($('#increase').val());

			if(this.gem_info[gem.name]['generosity']>0)
				percent_inc+= 19+parseInt(this.gem_info[gem.name]['generosity']);
			//console.log(percent_inc, 'inc:', 1 + (percent_inc/100));
			let stats = gem.level_stats(this.gem_info[gem.name]['level'], 1 + (percent_inc/100) );

			if(stats.length>0){
				let cont = $("<div>").addClass('stat_block');
				let title = $('<div>').addClass('gem_title').text(gem.name);
				let chk = $("<input>").attr("type", "checkbox");
				let lvl = $("<input>").attr("type", "number").addClass('lvl_input').attr('title','Gem Level');
				let gen = $("<input>").attr("type", "number").addClass('gen_input').attr('title','Generosity Level');
				let disabled = this.gem_info[gem.name]['disabled'];

				chk.prop('checked', !disabled);
				chk.on('change', ()=>{
					this.gem_info[gem.name]['disabled'] = !chk.prop('checked');
					console.log(this.gem_info[gem.name]['disabled']);
					this.calculate();
				});

				lvl.val(this.gem_info[gem.name]['level']);
				lvl.on('change', ()=>{
					this.gem_info[gem.name]['level'] = parseInt(lvl.val());
					this.calculate();
				});

				gen.val(this.gem_info[gem.name]['generosity']);
				gen.on('change', ()=>{
					this.gem_info[gem.name]['generosity'] = parseInt(gen.val());
					this.calculate();
				});
				title.append(chk);
				title.append(lvl);
				title.append(gen);
				cont.append(title);

				let rnd = function random() {
					let x = Math.sin(seed++) * 10000;
					return x - Math.floor(x);
				};
				let cssHSL = "hsl(" + 360 * rnd() + ',' +
					(25 + 70 * rnd()) + '%,' +
					(65 + 10 * rnd()) + '%)';

				stats.forEach((txt)=>{
					cont.append($("<div>").addClass('gem_mod').text(txt));
					if(!disabled) {
						$("#totals").append($('<span>').addClass('total_mod').css('color', cssHSL).html(txt) );
					}
				});
				if(disabled)
					cont.addClass('disabled_gem');
				else
					total_active++;
				$("#output").append(cont);
			}
		});
		console.log('total buffs:', total_active);
		let necro_buffs = [
			Math.round(3*total_active*(1 + (parseInt($('#increase').val())/100) ))+'% increased Attack and Cast Speed',
			'30% increased Damage',
			'+20% to all Elemental Resistances'
		];
		necro_buffs.forEach((buff)=>{
			$("#totals").append($('<span>').addClass('total_mod').html(buff) );
		});

		console.log(this.gem_info);
		window.location.hash = this.encode_build();
	}


	encode_build(){
		let out = '1,';// Version 1.
		out+= $('#increase').val()+',';
		out+='|';
		Object.keys(this.gem_info).forEach((idx)=> {
			let gem = this.gem_info[idx];
			out+=idx+',';
			Object.keys(gem).forEach((key)=> {
				let val = gem[key];
				if(val === true)
					val = 't';
				if(val === false)
					val = 'f';
				out+= val+',';
			});
			out+='|';
		});
		return btoa(out);
	}


	decode_build(){
		if(window.location.hash){
			let sp = atob(window.location.hash.replace('#', '')).split('|');
			for(let i=0; i<sp.length;i++){
				if(sp[i].trim()==='')
					continue;
				let gr = sp[i].split(',');
				if(i === 0){
					console.log('Loading version: '+gr[0]);
					$('#increase').val(parseInt(gr[1]));
					continue;
				}
				let fields = ['level', 'disabled', 'generosity'];
				let name = gr[0];
				let obj = {};
				for(let x = 0; x<fields.length;x++) {
					let val = gr[x + 1];
					if(val === 't')
						val = true;
					if(val === 'f')
						val = false;
					obj[fields[x]] = val;
				}
				this.gem_info[name] = obj;
			}
		}
	}
}