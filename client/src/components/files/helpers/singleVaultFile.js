import { fetchData } from '../../shared/helpers/fetch';
import { setGlobal, getGlobal } from 'reactn';
import { postData } from '../../shared/helpers/post';
import { ToastsStore} from 'react-toasts';
import update from 'immutability-helper';
import XLSX from "xlsx";
const mammoth = require("mammoth");
const str2ab = require("string-to-arraybuffer");
const rtfToHTML = require('./rtf-to-html');
const Papa = require('papaparse');
let abuf4;
var FileSaver = require('file-saver');
let timer = null;

export async function loadSingleVaultFile(props) {
    setGlobal({loading: true})
    const file = `${props}.json`
    const fileParams = {
        fileName: file,
        decrypt: true
    }

    let thisFile = await fetchData(fileParams);
    await setGlobal({
        file: JSON.parse(thisFile), 
        singleFile: JSON.parse(thisFile),
        name: JSON.parse(thisFile).name, 
        type: JSON.parse(thisFile).type,
        link: JSON.parse(thisFile).link
    })
    if (getGlobal().type.includes("word")) {
        abuf4 = str2ab(getGlobal().link);
        mammoth
          .convertToHtml({ arrayBuffer: abuf4 })
          .then(result => {
            var html = result.value; // The generated HTML
            setGlobal({ content: html });
            setGlobal({ loading: false });
          })
          .done();
      }

      else if (getGlobal().type.includes("rtf")) {
        let base64 = getGlobal().link.split("data:text/rtf;base64,")[1];
        rtfToHTML.fromString(window.atob(base64), (err, html) => {
          console.log(window.atob(base64));
          console.log(html)
          let htmlFixed = html.replace("body", ".noclass");
          setGlobal({ content:  htmlFixed});
          setGlobal({ loading: "hide", show: "" });
        })
      }

      else if (getGlobal().type.includes("text/plain")) {
        let base64 = getGlobal().link.split("data:text/plain;base64,")[1];
        setGlobal({ loading: "hide", show: "" });
        setGlobal({ content: window.atob(base64) });
      }

      else if (getGlobal().type.includes("sheet")) {
        abuf4 = str2ab(getGlobal().link);
        var wb = XLSX.read(abuf4, { type: "buffer" });
        var first_worksheet = wb.Sheets[wb.SheetNames[0]];
        var data = XLSX.utils.sheet_to_json(first_worksheet, { header: 1 });
        
        setGlobal({ grid: data });
        setGlobal({ loading: "hide", show: "" });
      }

      else if (getGlobal().type.includes("csv")) {
        let base64 = getGlobal().link.split("data:text/csv;base64,")[1];
        setGlobal({ grid: Papa.parse(window.atob(base64)).data });
        setGlobal({ loading: "hide", show: "" });
      }
      setGlobal({ loading: false });
}

export async function downloadPDF() {
    var oReq = new XMLHttpRequest();
    var URLToPDF = getGlobal().singleFile.link;

    // Configure XMLHttpRequest
    oReq.open("GET", URLToPDF, true);

    // Important to use the blob response type
    oReq.responseType = "blob";

    // When the file request finishes
    // Is up to you, the configuration for error events etc.
    oReq.onload = function() {
        // Once the file is downloaded, open a new window with the PDF
        // Remember to allow the POP-UPS in your browser
        var file = new Blob([oReq.response], { 
            type: 'application/pdf' 
        });
        
        // Generate file download directly in the browser !
        FileSaver.saveAs(file, getGlobal().name);
    };

    oReq.send();
}

export function onDocumentComplete(pages) {
    setGlobal({ page: 1, pages });
}

export function onPageComplete(page) {
    setGlobal({ page });
}

export async function signWithBlockusign(fileId) {
    const { userSession } = getGlobal();
    const options = { username: userSession.loadUserData().username, zoneFileLookupURL: "https://core.blockstack.org/v1/names", decrypt: false, app: 'https://blockusign.co'}
    try {
        let dataParams = {
            fileName: 'key.json', 
            options, 
            decrypt: false
        }
        let thisKey = await fetchData(dataParams);
        if(thisKey) {
            const data = JSON.stringify(getGlobal().singleFile);
            const encryptedData = userSession.encryptContent(data, {publicKey: JSON.parse(thisKey)})
            
            let postParams = {
                fileName: `blockusign/${fileId}`, 
                encrypt: false, 
                body: JSON.stringify(encryptedData)
            }

            let postedData = await postData(postParams);
            console.log(postedData);
        } else {
            ToastsStore.error(`It looks like you've never signed into Blockusign before. Please do so first.`)
        }
    } catch(error) {
        console.log(error);
    }
  }

  export async function shareVaultFile() {
    ToastsStore.success(`Creating public link...`)
    let fileName = `public/vault/${window.location.href.split('files/')[1].split('#')[0]}.json`;
    let singleFile = await getGlobal().singleFile;
    singleFile["publicVaultFile"] = true;
    await setGlobal({ singleFile, publicVaultFile: true });
    //First we save the single file with its updates. 
    await saveFile();
    //Now we save the file publicly
    const publicParams = {
        fileName, 
        encrypt: false, 
        body: JSON.stringify(singleFile)
    }
    const postedPublic = await postData(publicParams);
    console.log(postedPublic);
    //Finally, we update the fileIndex
    ToastsStore.success(`File shared publicly!`)
  }

  export async function stopSharingPubVaultFile() {
    ToastsStore.success(`Removing access...`)
    let fileName = `public/vault/${window.location.href.split('files/')[1]}.json`;
    let singleFile = await getGlobal().singleFile;
    singleFile["publicVaultFile"] = false;
    await setGlobal({ singleFile, publicVaultFile: false});

    await saveFile();

    let publicParams = {
        fileName, 
        encrypt: false, 
        body: JSON.stringify({})
    }
    const postedPublic = await postData(publicParams);
    console.log(postedPublic);

    ToastsStore.success(`File no longer shared publicly`)
  }

  export async function handleName(e) {
    let name = e.target.value;
    let singleFile = await getGlobal().singleFile;
    singleFile["name"] = name;
    await setGlobal({ name, singleFile });
    clearTimeout(timer); 
    timer = setTimeout(() => saveFile(), 1500);
  }

  export async function saveFile() {
    let singleFile = await getGlobal().singleFile;
    let singleFileParams = {
        fileName: `${window.location.href.split('files/')[1]}.json`, 
        encrypt: true, 
        body: JSON.stringify(singleFile)
    }
    const postedFile = await postData(singleFileParams);
    console.log(postedFile);
    await saveIndex();
  }

  export async function saveIndex() {
    let files = await getGlobal().files;
    let file = await getGlobal().singleFile;
    const indexObject = {
        uploaded: file.uploaded,
        timestamp: Date.now(), 
        name: file.name,
        size: file.size,
        type: file.type,
        tags: file.tags,
        sharedWithSingle: file.sharedWithSingle,
        lastModified: file.lastModified,
        lastModifiedDate: file.lastModifiedDate,
        publicVaultFile: file.publicVaultFile,
        id: file.id, 
        fileType: "vault"
    }
    let index = await files.map((x) => {return x.id }).indexOf(window.location.href.split('files/')[1]);
    if(index > -1) {
      const updatedFiles = update(getGlobal().files, {$splice: [[index, 1, indexObject]]});
      await setGlobal({files: updatedFiles, filteredFiles: updatedFiles});
    } else {
      console.log("Error doc index")
    }
    let fileIndexParams = {
        fileName: 'uploads.json', 
        encrypt: true, 
        body: JSON.stringify(getGlobal().files)
    }
    const postedIndex = await postData(fileIndexParams);
    console.log(postedIndex);
  }

  export function handlePrevious (props){
    setGlobal({ page: props })
  }
