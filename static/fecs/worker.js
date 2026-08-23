const wasm_uri = "fecs.wasm";

var log = function () {};
//var log = function () { console.log.apply(console.log, arguments); }

var wasm_app;

const wasm_memory = new WebAssembly.Memory(
 { initial: 1,
   maximum: 1
   });

var importObject = {"env": {"memory": wasm_memory,
                           "outstreamWrite": outstreamWrite
                           } };

const decoder = new TextDecoder("utf8");
const encoder = new TextEncoder();

var outstream_write_fn = function(bytesArr) {};
var outstream_close_fn = function() {};

function outstreamWrite(len) {
   const start = 0xA00;
   const memory = new Uint8Array(wasm_memory.buffer);
   const bytesArr = memory.slice(start, start + len); // reuse buffer with memory.subarray(start, start + len)
   outstream_write_fn(bytesArr);
}
function outstreamClose() {
   outstream_close_fn();
}

function fecsStr(m32, ptr) {
      if((ptr & 2) != 2) {
         return "NOTASTRTOPRINT";
      }
       var head = (ptr - 2);
       var decoder = new TextDecoder();
       var out_chars = [];
       var STOP = 0;
       while (1) { // && STOP++ < 4){
           var at_val = m32[head / 4];
                 var chars = new ArrayBuffer(4);
                 var view_chars = new DataView(chars);
                 view_chars.setUint32(0, at_val, true);
                 for (i = 0; i < 4; i++) {
                  var c = view_chars.getUint8(i);
                  if (c == 0) {
                      break;
                  }
                  out_chars.push(c);
                  if (i == 3) {
                      break;
                  }
              }
              head = m32[(head / 4) + 1];
              if (head == 0x414) {
                  break;
              }
              head = head - 2;

          }
          return decoder.decode(new Uint8Array(out_chars).buffer);
      }

WebAssembly.instantiateStreaming(fetch(wasm_uri, { cache: "no-cache" }), importObject).then((result) => {
  wasm_app = result.instance;
  wasm_app.exports.initVM();
  postMessage({ action: "ready", payload: wasm_memory.buffer });
}).catch((err) => {
   console.error("Worker loading wasm fail: ", err);
});

onmessage = (msg) => {
   log("worker msg", msg);
   log("wasm memory", wasm_memory);
   const data = msg.data;
   const action = data.action;
   const payload = data.payload;
   switch(action) {
      case "in": {
         try {
         const str_in_bytes = payload;
         const str_in_bytes_length = str_in_bytes.length;
         const nonFullBatch = str_in_bytes_length < 4096;
         const buf_length = nonFullBatch ? str_in_bytes_length + 1 : 4096;
         var bb_ptr = wasm_app.exports.fecs_ioInBufferStart();
         var bb_chars = new Uint8Array(wasm_memory.buffer, bb_ptr, buf_length);
         bb_chars.set(str_in_bytes.slice(0, str_in_bytes_length));
         // final batch is not a full buffer
         if (nonFullBatch) {
            bb_chars[buf_length - 1] = 0;
            log("worker added 0 end",bb_chars[buf_length - 1]);
            }
         log("bb_ptr");
         log(bb_ptr);
         var outputText = "";
         outstream_write_fn = function(bytesArr) {
            outputText += decoder.decode(bytesArr);
         };
         outstream_close_fn = function() {
            outstream_write_fn = function() {};
            outstream_close_fn = function() {};
         }
          var result_pointer = wasm_app.exports.readEvalInMulti();
         if (str_in_bytes_length == 4096) {
            log("Worker expects more in calls");
            outstream_close_fn();
            postMessage({ action: "out", payload: encoder.encode(outputText) });
            outputText = "";
            return;
         }
         log("result_pointer");
         log(result_pointer);
         
         if (result_pointer == 0) {
            console.log("parser will wait for more input");
            return;
         }
         var out_pointer = wasm_app.exports.fecs_print(result_pointer);
         log("out_pointer");
         log(out_pointer);

         const m32 = new Uint32Array(wasm_memory.buffer);
         var out_string = fecsStr(m32, out_pointer);
         log("OUT", out_string);

         wasm_app.exports.fecs_flush();
         outstream_write_fn(encoder.encode("-> "));
         outstream_write_fn(encoder.encode(out_string));
         outstreamClose();
         postMessage({ action: "out", payload: encoder.encode(outputText) });

         } catch (err) {
            if(err.message?.includes("unreachable")) {
               console.log(wasm_memory.buffer);
               const b = new Int32Array(wasm_memory.buffer);
               if (b[2] == 1330336851) { // nnn = STKO
                  postMessage({ action: "out", payload: encoder.encode("FATAL -- StackOverflow") });
               }
               console.error("Caught err in wasm: ", err);
            }
         }
        break;
      }
      case "enableLog": {
         log = function () {
            console.log.apply(console.log, arguments);
         }
         break;
      }
      default: {
         console.error("unhandled worker msg", msg);
      }
   }
}
