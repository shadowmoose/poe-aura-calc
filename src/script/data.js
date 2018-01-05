class Gem{
	constructor(name, description, mods, level_array){
		this.name = name;
		this.description = description;
		this.mods = mods;
		this.level_array = level_array;
	}


	/** Returns an array of formatted text lines, showing this aura's effects at the given level. */
	level_stats(level, effect_increase){
		let lvl = ""+level;//Math.max(1, Math.min(this.level_array.length, level));
		console.log(this.name, '  level: ', lvl);
		let stats = this.level_array[lvl]['stats'];

		let final_vals = {};

		for(let i=0; i < stats.length; i++){
			let mod_text = this.mods[i]['text'];
			let mod_values = stats[i]?stats[i]['values']:null;

			if(mod_text.includes('radius') || mod_text.includes('duration') || !mod_values)continue;

			mod_text = mod_text.replace(/{.?}/g, '#');
			mod_text = mod_text.replace(/You and nearby allies .+? /g, '').trim();
			if(mod_text.includes('per second'))
				mod_text = 'Regenerate '+mod_text;
			if(!final_vals[mod_text])
				final_vals[mod_text] = [];

			for(let idx = 0; idx<mod_values.length; idx++) {
				let rounded = (Math.floor( mod_values[idx] * effect_increase * 100 ) / 100);
				if(!mod_text.includes('Regenerate'))rounded =  Math.floor(rounded);
				final_vals[mod_text].push(rounded);
			}
		}
		return final_vals;
	}
}



class Data {
	constructor() {
		this.source_url = 'https://raw.githubusercontent.com/brather1ng/RePoE/master/data/gem_tooltips.min.json';
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
				let base_item = ele['static'];
				if (!base_item['properties'] ||!base_item['properties'][0]||
					!base_item['properties'][0].includes('Aura') ||
					base_item['properties'][0].includes('Support') ||
					base_item['properties'][0].includes('Totem'))
					return;
				this.gems.push(
					new Gem(base_item['name'], base_item['description'][0], base_item['stats'], ele['per_level'])
				);
				console.log(base_item['name']);
			});

			console.log(this.gems);
			this.calculate();
		}.bind(this));
	}


	calculate(){
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
		let total_speed_buff = 0;
		let grouped_stats = {};

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

			let stats = gem.level_stats(this.gem_info[gem.name]['level'], 1 + (percent_inc/100) );

			if(Object.keys(stats).length>0){
				let cont = $("<div>").addClass('stat_block');
				let title = $('<div>').addClass('gem_title').text(gem.name).attr('title', gem.description);
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
				title.append(chk);
				title.append(lvl);
				title.append(gen);
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
					total_speed_buff+= 3*( 1 + (percent_inc/100) );
					Object.keys(stats).forEach((stat)=> {
						// if not disabled, add this gem's normalized mod objects to the total grouped mods.
						if(!grouped_stats[stat])
							grouped_stats[stat] = stats[stat];
						else
							stats[stat].forEach((s, idx)=>{
								grouped_stats[stat][idx]+=s;
							})
					});
				}
				$("#output").append(cont);
			}
		});

		console.log('total buffs:', total_active);
		$('#aura_count').text(total_active+' total auras');
		let necro_buffs = {
			'#% increased Attack Speed':[Math.floor(total_speed_buff)],
			'#% increased Cast Speed':[Math.floor(total_speed_buff)],
			'#% increased Damage':[30],
			'+#% to all Elemental Resistances':[20],
		};
		Object.keys(necro_buffs).forEach((stat)=> {
			if(!grouped_stats[stat])
				grouped_stats[stat] = necro_buffs[stat];
			else
				necro_buffs[stat].forEach((s, idx)=>{
					grouped_stats[stat][idx]+=s;
				})
		});
		console.log(grouped_stats);
		console.log(this.gem_info);

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
			$("#totals").append($('<span>').addClass('total_mod').css('color', cssHSL).html(txt) );
		});

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