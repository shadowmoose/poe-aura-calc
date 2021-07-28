let translations = [];

const ignoredMods = [
	'base_skill_effect_duration',
	'skill_physical_damage_%_to_convert_to_lightning',
	'melee_range_+',
	'active_skill_area_damage_+%_final',
	'base_radius',
	'modifiers_to_',
	'no_mana_cost',
	'aura_effect_',
	'base_cooldown_speed',
	'attack_damage_taken_+%_final_from_enemies_unaffected_by_sand_armour'
];

const ignoredGems = [
	'Summon Skitterbots',
	'Blinding Aura',
	'Death Aura'
];

const knownTranslations = {
	'puresteel_banner_accuracy_rating_+%_final': 'Nearby Enemies have {0}% more Accuracy Rating'
};

const removeModParts = [
	/Aura grants /,
	/You and nearby Allies [^R]\w+\s/i, // Clean all non-Regen.
	/You and nearby Allies /, // All "Regen" auras.
	[/Enemies maimed by this skill/i, 'Nearby Enemies']  // Replace values.
];

function translate(id) {
	try{
		return knownTranslations[id] || translations.find(trn => trn.ids.includes(id)).English[0].string;
	} catch (err) {
		console.warn(`Failed ID lookup: ${id}`);
		return null;
	}
}

class Gem {
	constructor(name, description, stats, level_array){
		this.name = name;
		this.description = description;
		this.stats = stats;
		this.level_array = level_array;
	}

	findNumbers(str) {
		return (str.match(/{[0-9]+}/gm) || []).length;
	}

	/** Returns an object, where each key is a generic stat line, and the value is the array of numbers to be inserted. */
	levelStats(lvl, effect_increase, buff_eff){
		console.log(this.name, 'level:', lvl)
		if (!this.level_array[lvl]) {
			lvl = Object.keys(this.level_array).reduce((acc, curr) => {
				if (Math.abs(lvl - curr) < Math.abs(lvl - acc)) return curr;
				return acc;
			}, 1000);
			lvl = parseInt(lvl);
		}
		let stats = (this.level_array[lvl]['stats']||[]).filter(o=>!!o).map(o => o.value);

		// For each stat, if it has numbers in the string, { pop } them from the number array and concat them.
		let final_vals = {};
		const seen = new Set();

		for (const mod of this.stats) {
			if (mod.id.includes('deal_no_damage')) continue;
			let modText = translate(mod.id) || '';
			if (seen.has(modText)) continue;
			seen.add(modText);
			const cnt = this.findNumbers(modText);
			const vals = [];

			for (let i=0; i<cnt; i++) {
				let val = mod.value !== undefined ? mod.value : stats.shift();

				if (mod.value === 0) {
					modText = '';
					continue;
				}

				val = val * effect_increase * buff_eff;
				val = mod.id.includes('per_minute') ? Math.floor(val/60*100)/100 : Math.floor(val);
				val = val || 0;
				modText = modText.replace(/{[0-9]+}/, '#');
				vals.push(val);
			}

			if (ignoredMods.some(ig => mod.id.includes(ig))) continue;
			if (modText) {
				removeModParts.forEach(rmg => {
					let rm = Array.isArray(rmg) ? rmg[0] : rmg;
					let rp = Array.isArray(rmg) ? rmg[1] : '';
					modText = modText.replace(rm, rp).trim()
				});
				if (modText.includes('Elemental Resi') || modText.includes('to Accuracy')) modText = `+${modText}`;
				final_vals[modText] = vals;
			}
		}

		return final_vals;
	}
}



class Data {
	constructor() {
		this.source_url = 'https://raw.githubusercontent.com/brather1ng/RePoE/master/RePoE/data/gems.min.json';
		this.translation_url = 'https://raw.githubusercontent.com/brather1ng/RePoE/master/RePoE/data/stat_translations/aura_skill.min.json';
		this.data = {};
		this.gems = [];
		this.gem_info = {};
		this.ascendancy = {};
		this.saved_prompts = {};
		this.rendered_prompts = {};
		this.precise = {};
		this.replenish = {};
		this.decode_build();
		this.download();
	}


	async download(){
		translations = await fetch(this.translation_url).then(res=>res.json());

		$.getJSON(this.source_url, (resp) => {
			this.data = resp;

			console.log('Gem data:', this.data);

			Object.keys(this.data).forEach((key)=> {
				let base = this.data[key];
				let ele = base['active_skill'];
				if (!ele) return;
				let baseItem = base['base_item'];
				if (!baseItem) return;

				const name = ele['display_name'];
				if (!name
					|| ignoredGems.includes(name)
					|| baseItem['id'].includes('Royale')
					|| !ele['types'].includes('aura')
					|| ['totem', 'mine'].some(ig => ele['types'].includes(ig))
					|| base.is_support
					|| !base.base_item
					|| !base.static.stats
				) return;

				this.gems.push(
					new Gem(name, ele['description'], base.static.stats, this.data[key]['per_level'])
				);
				console.log(name, base);
			});

			console.log(this.gems);
			this.calculate();
		});
	}

	query(msg, force=false){
		let saved = this.saved_prompts[msg];
		if(force) saved = null;
		let pr = saved || parseFloat(prompt('Enter your '+msg+':'));
		if(!pr){
			if(this.saved_prompts[msg]) {
				delete this.saved_prompts[msg];
			}
			if(this.rendered_prompts[msg]){
				this.rendered_prompts[msg].remove();
				delete this.rendered_prompts[msg];
			}
			this.calculate();
			return
		}
		this.saved_prompts[msg] = pr;
		if(!this.rendered_prompts[msg]) {
			let an = $('<a>').addClass("input_value").attr('title', 'Click to change value.');
			an.click(()=>{
				this.query(msg, true);
				this.calculate();
			});
			console.log('Built:', an);
			this.rendered_prompts[msg] = an;
			$("#saved_vals").append(an);
		}
		this.rendered_prompts[msg].text(msg+': '+pr);
		return pr;
	}

	get_ascendancy(){
		let sel = $('#asc_choice').val();
		if(sel === 'necromancer'){
			return {
				'#% increased Attack Speed': {scaling: 3},
				'#% increased Cast Speed': {scaling: 3},
				'#% increased Damage': {flat: 30},
				'+#% to all Elemental Resistances': {flat: 30}
			}
		}
		if(sel === 'guardian'){
			return {
				'# additional Energy Shield': {flat: this.query("Reserved Mana")*.10},
				'+# to Armour': {flat: this.query("Reserved Life")*1.6},
				'#% increased Damage': {flat: 30},
				'#% more Damage': {flat: 10},
				'#% increased Area of Effect': {flat: 30},
				'#% increased Attack Speed': {flat: 20},
				'#% increased Cast Speed': {flat: 20},
				'#% increased Movement Speed': {flat: 20},
				'Onslaught': {flat: 1},
				'Intimidate Enemies for 4 seconds on Hit': {flat: 1},
				'Unnerve Enemies for 4 seconds on Hit': {flat: 1},
				'Regenerate #% of Life per second': {scaling: 0.2},
				'#% additional Physical Damage Reduction': {scaling: 1}
			}
		}
		if(sel === 'necrian'){
			return {
				'#% increased Attack Speed': {scaling: 2},
				'#% increased Cast Speed': {scaling: 2},
				'#% Physical Damage Reduction': {scaling: 1},
				'Onslaught': {flat: 1},
			}
		}
		if (sel === 'champion'){
			return {
				' #% increased Movement Speed': {flat: 12},
			}
		}
	}
	
	get_precise(){
		let sel = $('#preciseCommander').prop( "checked" );
		if(sel)
			return {
				'#% increased Critical Strike Chance': {flat: 50},
				'+#% to Global Critical Strike Multiplier': {flat: 15}
			}
	}
	get_replenish(){
		let sel = $('#replenishingPresence').prop( "checked" );
		if (sel)
			return {
				'Regenerate #% of Life per second': {scaling: 0.2},
			}
	}


	calculate(){
		this.ascendancy = this.get_ascendancy();
		this.precise = this.get_precise();
		this.replenish = this.get_replenish();
		this.gems = this.gems.sort(function(a, b) {
			let nameA = a.name.toUpperCase();
			let nameB = b.name.toUpperCase();
			if (nameA < nameB) {
				return -1;
			}
			if (nameA > nameB) {
				return 1;
			}
			return 0;
		});
		$("#output").empty();
		$("#totals").html("");

		let total_active = 0;
		let grouped_stats = {};

		this.gems.forEach((gem)=>{
			if(!this.gem_info[gem.name]){
				this.gem_info[gem.name] = {
					'level':gem.name === 'Clarity'?1:20,
					'disabled':true,
					'generosity':0,
					'effect':0
				};
			}
			
			let percent_inc = parseInt($('#increase').val());
			let buff_effect = parseInt($('#buffEffect').val());
			
			if(this.gem_info[gem.name]['effect']>0)
				percent_inc+= parseInt(this.gem_info[gem.name]['effect']);
			
			if(this.gem_info[gem.name]['generosity']>0)
				percent_inc+= 19+parseInt(this.gem_info[gem.name]['generosity']);

			let stats = gem.levelStats(this.gem_info[gem.name]['level'], 1 + (percent_inc/100), 1 + (buff_effect/100) );

			if(Object.keys(stats).length>0){
				let cont = $("<div>").addClass('stat_block');
				let title = $('<label>').addClass('gem_title').text(gem.name).attr('title', gem.description);
				let chk = $("<input>").attr("type", "checkbox");
				let lvl = $("<input>").attr("type", "number").addClass('lvl_input').attr('title','Gem Level');
				let gen = $("<input>").attr("type", "number").addClass('gen_input').attr('title','Generosity Level');
				let eff = $("<input>").attr("type", "number").addClass('effect_input').attr('title','Specific Aura Effect');
				let disabled = this.gem_info[gem.name]['disabled'];

				chk.prop('checked', !disabled);
				chk.on('change', ()=>{
					this.gem_info[gem.name]['disabled'] = !chk.prop('checked');
					this.calculate();
				});

				lvl.val(this.gem_info[gem.name]['level']);
				lvl.prop('min', '1').prop('max', '30');
				lvl.on('change', ()=>{
					this.gem_info[gem.name]['level'] = Math.min(30, Math.max(1, parseInt(lvl.val()) ));
					this.calculate();
				});

				gen.val(this.gem_info[gem.name]['generosity']);
				gen.prop('min', '0').prop('max', '30');
				gen.on('change', ()=>{
					this.gem_info[gem.name]['generosity'] = Math.min(30, Math.max(0, parseInt(gen.val()) ));
					this.calculate();
				});

				eff.val(this.gem_info[gem.name]['effect']);
				eff.prop('min', '0').prop('max', '600');
				eff.on('change', ()=>{
					this.gem_info[gem.name]['effect'] = Math.min(600, Math.max(0, parseInt(eff.val()) ));
					this.calculate();
				});

				title.append(chk);
				title.append(lvl);
				title.append(gen);
				title.append(eff);
				cont.append(title);

				Object.keys(stats).forEach((stat)=> {
					//build local list of this gem's mods.
					let txt = stat;
					stats[txt].forEach((num)=>{
						txt = txt.replace('#', num);
					});
					cont.append($("<div>").addClass('gem_mod').text(txt));
				});
				if(disabled) {
					cont.addClass('disabled_gem');
				} else {
					total_active++;
					Object.keys(this.ascendancy).forEach(name => {
						let st = this.ascendancy[name];
						if(st.scaling){
							st.total = st.total || 0;
							if(st.scaling < 1)
								st.total += (Math.floor(st.scaling * ( 1 + (percent_inc/100)) * 10) / 10)
							else
								st.total += Math.floor(st.scaling * ( 1 + (percent_inc/100)))
						}else if(st.flat){
							st.total = st.flat
						}
					});

					if($('#replenishingPresence').prop( "checked" )){
						Object.keys(this.replenish).forEach(name => {
							let st = this.replenish[name];
							st.total = st.total || 0;
							st.total += (Math.floor(st.scaling * ( 1 + (percent_inc/100)) * 10) / 10);
						});
					}

					if($('#preciseCommander').prop( "checked" )){
						Object.keys(this.precise).forEach(name => {
							let st = this.precise[name];
							st.total = st.flat
						});
					}

					Object.keys(stats).forEach((stat)=> {
						// if not disabled, add this gem's normalized mod objects to the total grouped mods.
						if(!grouped_stats[stat]) {
							grouped_stats[stat] = stats[stat];
						} else {
							stats[stat].forEach((s, idx) => {
								grouped_stats[stat][idx] += s;
							})
						}
					});
				}
				$("#output").append(cont);
			}else{
				// Missing any visible stats:
				this.gem_info[gem.name]['disabled'] = true;
				console.log("Hiding invisible gem:", gem.name);
			}
		});

		console.log('total buffs:', total_active);
		$('#aura_count').text(total_active+' total auras');
		let asc_buffs = this.ascendancy;
		Object.keys(asc_buffs).forEach((stat)=> {
			let val = [Math.floor(asc_buffs[stat].total)];
			if(asc_buffs[stat].scaling)
				val = [Math.floor(asc_buffs[stat].total * 100 * (1+((parseInt($('#buffEffect').val()))/100))) / 100];
			if(!asc_buffs[stat].total) return;
			if(!grouped_stats[stat])
				grouped_stats[stat] = val;
			else
				val.forEach((s, idx)=>{
					grouped_stats[stat][idx]+=s;
				})
		});
		
		if($('#preciseCommander').prop( "checked" )){
			let jewel_buffs = this.precise;
			Object.keys(jewel_buffs).forEach((stat)=> {
				let val = [Math.floor(jewel_buffs[stat].total)];
				if(!jewel_buffs[stat].total) return;
				if(!grouped_stats[stat])
					grouped_stats[stat] = val;
				else
					val.forEach((s, idx)=>{
						grouped_stats[stat][idx]+=s;
					})
			});
		}
		
		if($('#replenishingPresence').prop( "checked" )){
			let jewel_buffs = this.replenish;
			Object.keys(jewel_buffs).forEach((stat)=> {
				let val = [Math.floor(jewel_buffs[stat].total)];
				if(jewel_buffs[stat].scaling)
					val = [Math.floor(jewel_buffs[stat].total * 100 * (1+((parseInt($('#buffEffect').val()))/100))) / 100];
				if(!jewel_buffs[stat].total) return;
				if(!grouped_stats[stat])
					grouped_stats[stat] = val;
				else
					val.forEach((s, idx)=>{
						grouped_stats[stat][idx]+=s;
					})
			});
		}

		let seed = 8;//random colors that persist.
		let rnd = function random() {
			let x = Math.sin(seed++) * 10000;
			return x - Math.floor(x);
		};

		let output_order = Object.keys(grouped_stats).sort();
		output_order.forEach((stat)=> {
			let txt = stat;
			grouped_stats[txt].forEach((num)=>{
				txt = txt.replace('#', num);
			});
			let cssHSL = "hsl(" + 360 * rnd() + ',' +
				(25 + 70 * rnd()) + '%,' +
				(75 + 10 * rnd()) + '%)';
			$("#totals").append($('<span>').addClass('total_mod').css('color', cssHSL).text(txt) );
		});

		window.location.hash = this.encode_build();
	}


	encode_build(){
		let inf = {};
		Object.keys(this.gem_info).forEach((nfo)=> {
			let n = this.gem_info[nfo];
			if(!n.disabled)
				inf[nfo] = n;
		});

		let out = JSON.stringify({
			'version': 2,
			'gem_info': inf,
			'increased_effect': $('#increase').val(),
			'preciseCommand': $('#preciseCommander').prop( "checked" ),
			'replenishing': $('#replenishingPresence').prop( "checked" ),
			'buff_effect': $('#buffEffect').val(),
			'saved_prompts': this.saved_prompts,
			'ascendancy': $('#asc_choice').val()
		});
		return this.compress(out);
	}


	decode_build(){
		if(window.location.hash && window.location.hash.replace('#', '')){
			try {
				let sp = this.decompress(window.location.hash.replace('#', ''));
				let data = JSON.parse(sp);
				$('#increase').val(data.increased_effect || 0);
				$('#buffEffect').val(data.buff_effect || 0);
				$('#preciseCommander').prop( "checked", data.preciseCommand || false);
				$('#replenishingPresence').prop( "checked", data.replenishing || false);
				$('#asc_choice').val(data.ascendancy || 'necromancer');
				this.gem_info = data.gem_info;
				this.saved_prompts = data.saved_prompts;
			}catch{
				try{
					this.decode_old();
				}catch{
					alert('Unable to decode built - please "Clear Page".');
				}
			}
		}
	}

	decode_old(){
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
				let fields = ['level', 'disabled', 'generosity', 'effect'];
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

	compress(string){
		let comp =  LZString.compressToEncodedURIComponent(string);
		console.log("Compressed from:", string.length, "to:", comp.length, 'output bytes.');
		return comp;
	}

	decompress(compressed){
		return LZString.decompressFromEncodedURIComponent(compressed);
	}
}
