(() => {

	const model = (() => {

		let zipWriter; 

		return {
			getEntriesBase64(options) {
				const inBase64Text = document.getElementById("inFile64").value;
				return (new zip.ZipReader(new zip.Data64URIReader(inBase64Text))).getEntries(options);
			},
			addFile(filename, reader, options) {
				if (!zipWriter) {
					zipWriter = new zip.ZipWriter(new zip.BlobWriter("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), { keepOrder: false });
				}
				return zipWriter.add(filename, reader, options);
			},
			async getBlobURL() {
				if (zipWriter) {
					const blobURL = URL.createObjectURL(await zipWriter.close());
					zipWriter = null;
					return blobURL;
				} else {
					throw new Error("Zip file closed");
				}
			}
		};

	})();

	(() => {

		const downloadButton = document.getElementById("download-button");
		const exampleButton = document.getElementById("example-button");
		
		let entries;
		exampleButton.addEventListener("click", onExampleButtonClick, false);
        	downloadButton.addEventListener("click", onDownloadButtonClick, false);


		function replaceByIdx(inText, i, newText) {
			const start = inText.indexOf("{{"+i+"}}");
  			const pStart = inText.lastIndexOf("<w:p>", start);
  			const pEnd = 6 + inText.indexOf("</w:p>", start);

		      	inText = inText.substring(0, pStart) + newText + inText.substring(pEnd, inText.length);
		      	return inText;
		}
		
		function oppIdx(i) {
			i = i - 1;
			const fiveMod = i % 5;
			return 20 + (Math.floor((i - fiveMod) / 5) * 5) + (5 - (i % 5));
		}

		function xmlText(inTrans) {
			const firstWord = `<w:p w14:paraId="29DA91B4" w14:textId="5698D0DE" w:rsidR="00C158CC" w:rsidRPr="00A63022" w:rsidRDefault="00C158CC" w:rsidP="00C63705"><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:pPr>
<w:r w:rsidRPr="00A63022"><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>
<w:t>${inTrans[0][0]}</w:t>
</w:r>`;

		
			var out = firstWord;
			if (inTrans.length > 1) {
				out += "<w:br/>";
				for (var i = 0; i < inTrans[1].length; i++) {
					if (Array.isArray(inTrans[1][i])) {
						const bold = `<w:r w:rsidRPr="00A63022"><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>
  <w:t xml:space="preserve">${inTrans[1][i][0]}</w:t></w:r><w:r w:rsidRPr="00A63022"><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:r>`;
  						out += bold;
  					} else {
						const regular = `<w:r w:rsidRPr="00A63022"><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr><w:t xml:space="preserve">${inTrans[1][i]}</w:t></w:r>`;
						out += regular;
					}
				}
			}

			  const ending = `</w:p>`;
  			return out + ending;
		}
		async function makeDoc(translats) {
			
			for (entry of entries) {
				
		      const inWriter = new zip.TextWriter();
		      let inText = await entry.getData(inWriter);
		      
		      if (entry.filename == "word/document.xml") {
		      	const noTextXml = `<w:p w14:paraId="29DA91B4" w14:textId="5698D0DE" w:rsidR="00C158CC" w:rsidRPr="00A63022" w:rsidRDefault="00C158CC" w:rsidP="00C63705"><w:pPr><w:jc w:val="center"/><w:rPr><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:pPr>
<w:r w:rsidRPr="00A63022"><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>
<w:t  xml:space="preserve"> </w:t>
</w:r></w:p>`; 
		      	 			
  			
  			for (var i = 1; i <= translats.length; i++) {
  				const [orig, trans] = translats[i-1];
			
 				
  				inText = replaceByIdx(inText, i, xmlText(orig));
  				inText = replaceByIdx(inText, oppIdx(i), xmlText(trans));
  				
  				
  			}
  			for (var i = translats.length+1; i <= 20; i++) {
 				inText = replaceByIdx(inText, i, noTextXml);
  				inText = replaceByIdx(inText, oppIdx(i), noTextXml);
  			
  			}
  			
  			
		      }
		      
		      const outReader = new zip.TextReader(inText);
		      const outEntry = await model.addFile(entry.filename, outReader, {});
		      
		      
			
			}
			
		}
		
		function parseBold(line) {
			line = line.trim();
			var on = false;
			var splitAt;
			const res = [];
			while (line.length > 0) {
			
				let starter = line.indexOf("_", splitAt);
				if (starter == -1) { starter = line.length; }
				res.push(line.substring(0, starter));
				line = line.substring(starter+1, line.length);
				let ender = line.indexOf("_", splitAt);
				if (ender == -1) { ender = line.length; }
				res.push([line.substring(0, ender)]);
				line = line.substring(ender+1, line.length);
			}
			return res;
		}
		
		function parseDash(line) {
			line = line.trim();
			const splitAt = line.indexOf("-");
			if (splitAt == -1) {
				return [[line]];
			} else {
				return [parseBold(line.substring(0, splitAt)), parseBold(line.substring(splitAt+1, line.length))];
			}
		}
		function parseLine(line) {
			const splitAt = line.indexOf(";");
			if (splitAt == -1) {
				alert("Geen ; in deze invoer: " + line);
				return [[line]];
			}
			return [parseDash(line.substring(0, splitAt)), parseDash(line.substring(splitAt+1, line.length))];
		}
		
		function parseText() {
			const linesInput = document.getElementById("linesInput").value;
			const lines = linesInput.split("\n");
			if (lines.length > 20) {
				alert("Alleen de eerste 20 voorbeelden worden gebruikt");
			}
			const res = [];
			lines.forEach((line, idx) => {
				if (idx < 20) {
					if (line.length > 0) {
					      res.push(parseLine(line));
					}
				}
			});
			return res;
			
		}
		async function onDownloadButtonClick(event) {
			const translats = parseText();
			entries = await model.getEntriesBase64( { filenameEncoding: "utf-8" });
			if (entries && entries.length) {
								
				await makeDoc(translats);
			}
		
		
			let blobURL;
			try {
				blobURL = await model.getBlobURL();
			} catch (error) {
				alert(error);
			}
			if (blobURL) {
				const anchor = document.createElement("a");
				const clickEvent = new MouseEvent("click");
				anchor.href = blobURL;
				const filenameOut = document.getElementById("file-out-name").value;
				anchor.download = filenameOut;
				anchor.dispatchEvent(clickEvent);
				
			}
			
			event.preventDefault();
		}
		function onExampleButtonClick(event) {
			const textArea = document.getElementById("linesInput");
			textArea.value = `Gaan - Lisa _gaat_ naar de verjaardag; To go - Lisa _goes_ to the birthday party\nBoom; Tree\nSpelen - De kinderen _spelen_ blij in de tuin; To play - The children _are_ happily _playing_ in the garden\n` + textArea.value;
		}

	})();

})();
