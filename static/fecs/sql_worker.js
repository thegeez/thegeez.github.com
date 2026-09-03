
const wasm_uri = "fecs_sql.wasm";

var log = function () {};
//var log = function () { console.log.apply(console.log, arguments); }
var error = function () {};

let sqlite3Js = "sqlite3.js";
importScripts(sqlite3Js);

globalThis.sqlite3ApiConfig = {
  disable: {
    vfs: {
      // Disable the following VFSes:
      "opfs": true,
      "opfs-sahpool": true,
      "opfs-wl": true,
      "kvvfs": true
    }
  }
};

globalThis.sqlite3InitModule({
    /* We can redirect any stdout/stderr from the module like so, but
       note that doing so makes use of Emscripten-isms, not
       well-defined sqlite APIs. */
    print: log,
    printErr: error
  }).then(function(sqlite3){
    //console.log('sqlite3 =',sqlite3);
    log("Done initializing. Running demo...");
    try {
    const capi = sqlite3.capi;
    log("sqlite3 version",capi.sqlite3_libversion(), capi.sqlite3_sourceid());
      loadFecsWasm(sqlite3);
      // console.log(sqlite3.wasm);
    }catch(e){
      error("Exception:",e.message);
    }
  });


var wasm_app;

var wasm_memory;
/*
const wasm_memory = new WebAssembly.Memory(
 { initial: 1,
   maximum: 1
   });
*/


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
function jsUploadDb() {
     postMessage({ action: "jsUploadDb" });
}
function jsExportDb(dbPointer) {
     const db = sqlite3_global.oo1.DB.wrapHandle(dbPointer);
     const byteArray = sqlite3_global.capi.sqlite3_js_db_export(db);
     postMessage({ action: "jsExportDb", payload: byteArray.buffer, dbFilename: db.filename }, [byteArray.buffer]);
}
var sqlite3_global;
async function loadFecsWasm(sqlite3) {
   wasm_memory = sqlite3.wasm.memory;
   sqlite3_global = sqlite3;
    const capi = sqlite3.capi,
          oo = sqlite3.oo1;
    const fnptr = sqlite3.wasm.exports.sqlite3_prepare_v2;
    log("sqlite wasm mem", sqlite3.wasm.memory);
    const db = new oo.DB("/mydb.sqlite3",'cwt'); // c create is not exists, t trace, w write
   var importObject = {"env": {"memory": wasm_memory,
                              "outstreamWrite": outstreamWrite,
                              "jsUploadDb": jsUploadDb,
                              "jsExportDb": jsExportDb,
                              "sqlite3_malloc": sqlite3.wasm.exports.sqlite3_malloc,
                              "sqlite3_realloc": sqlite3.wasm.exports.sqlite3_realloc,
                              "sqlite3_free": sqlite3.wasm.exports.sqlite3_free,
                              "sqlite3_open": sqlite3.wasm.exports.sqlite3_open,
                              "sqlite3_prepare_v2": sqlite3.wasm.exports.sqlite3_prepare_v2,
                              "sqlite3_step": sqlite3.wasm.exports.sqlite3_step,
                              "sqlite3_reset": sqlite3.wasm.exports.sqlite3_reset,
                              "sqlite3_finalize": sqlite3.wasm.exports.sqlite3_finalize,
                              "sqlite3_column_count": sqlite3.wasm.exports.sqlite3_column_count,
                              "sqlite3_column_name": sqlite3.wasm.exports.sqlite3_column_name,
                              "sqlite3_column_type": sqlite3.wasm.exports.sqlite3_column_type,
                              "sqlite3_column_int64": sqlite3.wasm.exports.sqlite3_column_int64,
                              "sqlite3_column_text": sqlite3.wasm.exports.sqlite3_column_text,
                              "sqlite3_bind_parameter_count": sqlite3.wasm.exports.sqlite3_bind_parameter_count,
                              "sqlite3_bind_parameter_index": sqlite3.wasm.exports.sqlite3_bind_parameter_index,
                              "sqlite3_bind_int64": sqlite3.wasm.exports.sqlite3_bind_int64,
                              "sqlite3_bind_text": sqlite3.wasm.exports.sqlite3_bind_text,
                              "sqlite3_bind_null": sqlite3.wasm.exports.sqlite3_bind_null,
                              "sqlite3_clear_bindings": sqlite3.wasm.exports.sqlite3_clear_bindings,
                       
                                 } };
      WebAssembly.instantiateStreaming(fetch(wasm_uri, { cache: "no-cache" }), importObject).then((result) => {
         wasm_app = result.instance;
         wasm_app.exports.initVM();
         wasm_app.exports.initSqlite3Lib();

     postMessage({ action: "ready", payload: wasm_memory.buffer });
   }).catch((err) => {
      console.error("Worker loading wasm fail: ", err);
   });
}
var seenErrorForReplRequestId = 0; // if any eval of a (multi-part) input had an error result, the rest of the input is dropped on the floor (there's no way to do back-pressure)
onmessage = (msg) => {
   log("worker msg", msg);
   log("wasm memory", wasm_memory);
   const data = msg.data;
   const action = data.action;
   const payload = data.payload;
   const replRequestId = data.replRequestId;
   switch(action) {
      case "in": {
       if (seenErrorForReplRequestId == replRequestId) {
         return;
       } else if (seenErrorForReplRequestId < replRequestId) {
         seenErrorForReplRequestId = 0;
       }
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
            if (result_pointer & 1) {
               seenErrorForReplRequestId = replRequestId;
               // go through printing and returning of results below
            } else {
               outstream_close_fn();
               postMessage({ action: "out", payload: encoder.encode(outputText) });
               outputText = "";
               return;
            }
         }
         log("result_pointer");
         log(result_pointer);
         
         if (result_pointer == 0) {
            log("parser will wait for more input");
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
         outstream_write_fn(encoder.encode("\n"));
         outstreamClose();
         postMessage({ action: "out", payload: encoder.encode(outputText) });

       } catch (err) {
            if(err.message?.includes("unreachable")) {
               console.log(wasm_memory.buffer);
               const b = new Int32Array(wasm_memory.buffer);
               if (b[2] == 1330336851) { // nnn = STKO
                  postMessage({ action: "out", payload: encoder.encode("FATAL -- StackOverflow") });
               }
            }
            console.error("Caught err in wasm: ", err);
            seenErrorForReplRequestId = replRequestId;
            postMessage({ action: "out", payload: encoder.encode("FATAL -- WASM error") });
       }
       break;
      }
      case "enableLog": {
         log = function () {
            console.log.apply(console.log, arguments);
         }
         error = function () {
            console.error.apply(console.error, arguments);
         }
         break;
      }
      case "uploadDb": {
           const arrayBuffer = payload; 
           const int8Buffer = new Uint8Array(arrayBuffer);
            int8Buffer.set([1,1], 18); // force db out of WAL mode
            postMessage({ action: "out", payload: encoder.encode("Imported file with byteLength: "+ arrayBuffer.byteLength) });

            const p = sqlite3_global.wasm.allocFromTypedArray(arrayBuffer);
            const db = new sqlite3_global.oo1.DB();
            const rc = sqlite3_global.capi.sqlite3_deserialize(
              db.pointer, 'main', p, arrayBuffer.byteLength, arrayBuffer.byteLength,
              sqlite3_global.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
              sqlite3_global.capi.SQLITE_DESERIALIZE_RESIZEABLE
            );
            db.checkRc(rc);

            const str_in_bytes = encoder.encode("(sdb~open "+ db.pointer +")");
            const str_in_bytes_length = str_in_bytes.length;
            const buf_length = str_in_bytes_length + 1;
            var bb_ptr = wasm_app.exports.fecs_ioInBufferStart();
            var bb_chars = new Uint8Array(wasm_memory.buffer, bb_ptr, buf_length);
            bb_chars[buf_length - 1] = 0;
            bb_chars.set(str_in_bytes.slice(0, str_in_bytes_length));
            var result_pointer = wasm_app.exports.readEvalInMulti();
            postMessage({ action: "out", payload: encoder.encode("-> " + result_pointer + "\n") });
            break;
      }
      default: {
         console.error("unhandled worker msg", msg);
      }
   }
}
