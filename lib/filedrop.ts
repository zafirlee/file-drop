// tslint:disable-next-line:max-line-length
function getMatchingItems(list: DataTransferItemList, acceptVal: string, multiple: boolean): DataTransferItem[] {
  const dataItems = Array.from(list);
  let results: DataTransferItem[];
  // Return the first item (or undefined) if our filter is for all files
  if (acceptVal === '') {
    results = dataItems.filter(item => item.kind === 'file');
    return (multiple) ? results : [results[0]];
  }

  // Split accepts values by ',' then by '/'. Trim everything & lowercase.
  const accepts = acceptVal.toLowerCase().split(',').map((accept) => {
    return accept.split('/').map(part => part.trim());
  }).filter(acceptParts => acceptParts.length === 2); // Filter invalid values

  const predicate = (item:DataTransferItem) => {
    // const file = item.webkitGetAsEntry();
    // 'Parse' the type.
    if (item.webkitGetAsEntry() && item.webkitGetAsEntry().isDirectory) {
      return true;
    }
    if (item.kind !== 'file') return false;
    const [typeMain, typeSub] = item.type.toLowerCase().split('/').map(s => s.trim());

    for (const [acceptMain, acceptSub] of accepts) {
      // Look for an exact match, or a partial match if * is accepted, eg image/*.
      if (typeMain === acceptMain && (acceptSub === '*' || typeSub === acceptSub)) {
        return true;
      }
    }
    return false;
  };

  results = results = dataItems.filter(predicate);
  if (multiple === false) {
    results = [results[0]];
  }
  return results;
}

// Safari and Edge don't quite support extending Event, this works around it.
function fixExtendedEvent(instance: Event, type: Function) {
  if (!(instance instanceof type)) {
    Object.setPrototypeOf(instance, type.prototype);
  }
}
interface FileObj {
  file:File;
  path:String;
}

interface FileDropEventInit extends EventInit {
  action: FileDropAccept;
  files: FileObj[];
}

type FileDropAccept = 'drop' | 'paste';

export class FileDropEvent extends Event {
  private _action: FileDropAccept;
  private _files: FileObj[];

  constructor(typeArg: string, eventInitDict: FileDropEventInit) {
    super(typeArg, eventInitDict);
    fixExtendedEvent(this, FileDropEvent);
    this._files = eventInitDict.files;
    this._action = eventInitDict.action;
  }

  get action() {
    return this._action;
  }

  get files() {
    return this._files;
  }
}

/*
  Example Usage.
  <file-drop
    accept='image/*'
    multiple | undefined
    class='drop-valid|drop-invalid'
  >
  [everything in here is a drop target.]
  </file-drop>

  dropElement.addEventListener('filedrop', (event) => console.log(event.detail))
*/
export class FileDropElement extends HTMLElement {

  private _dragEnterCount = 0;
  private _dragFileCount = 0;
  private files:FileObj[] = [];

  constructor() {
    super();

    // Bind
    this._onDragEnter = this._onDragEnter.bind(this);
    this._onDragLeave = this._onDragLeave.bind(this);
    this._onDrop = this._onDrop.bind(this);
    this._onPaste = this._onPaste.bind(this);

    this.addEventListener('dragover', event => event.preventDefault());
    this.addEventListener('drop', this._onDrop);
    this.addEventListener('dragenter', this._onDragEnter);
    this.addEventListener('dragend', () => this._reset());
    this.addEventListener('dragleave', this._onDragLeave);
    this.addEventListener('paste', this._onPaste);
  }

  get accept() {
    return this.getAttribute('accept') || '';
  }

  set accept(val: string) {
    this.setAttribute('accept', val);
  }

  get multiple() : string | null {
    return this.getAttribute('multiple');
  }

  set multiple(val: string | null) {
    this.setAttribute('multiple', val || '');
  }

  get directory() : string | null {
    return this.getAttribute('directory');
  }

  set directory(val: string | null) {
    this.setAttribute('directory', val || '');
  }

  // tslint:disable-next-line:max-line-length
  private getFileData(data: DataTransfer, accept: string, multiple: boolean, directory:boolean, action:string): FileObj[] {
    const dragDataItems = getMatchingItems(data.items, accept, multiple);
    // const files: FileObj[] = [];
    // This is because Map doesn't like the null type returned by getAsFile
    dragDataItems.forEach((item) => {
      const file = item.webkitGetAsEntry();
      if (file === null) return;
      // @ts-ignore
      this.traverseFileTree(file, '', accept, action, 1);
      // files.push(file);
      // files.concat(checkFolders(item));
    });

    return this.files;
  }

  // tslint:disable-next-line:max-line-length
  private traverseFileTree(item:any, path: string | undefined, acceptVal: string, action:FileDropAccept, reduce:number) {
    // tslint:disable-next-line:no-parameter-reassignment
    path = path || '';
    // tslint:disable-next-line:no-this-assignment
    const _mySelf = this;
    if (item.isFile) {
      this._dragFileCount += 1;
      item.file((myFile:File) => {
        _mySelf._dragFileCount -= reduce;
        console.log(_mySelf._dragFileCount, reduce);
        const accepts = acceptVal.toLowerCase().split(',').map((accept) => {
          return accept.split('/').map(part => part.trim());
        }).filter(acceptParts => acceptParts.length === 2); // Filter invalid values
        const [typeMain, typeSub] = myFile.type.toLowerCase().split('/').map(s => s.trim());
        for (const [acceptMain, acceptSub] of accepts) {
          // Look for an exact match, or a partial match if * is accepted, eg image/*.
          if (typeMain === acceptMain && (acceptSub === '*' || typeSub === acceptSub)) {
            const obj:FileObj = {
              file:myFile,
              // @ts-ignore
              path: path + myFile.name,
            };
            _mySelf.files.push(obj);
            if (_mySelf._dragFileCount <= 0) {
              const files = _mySelf.files;
              this.dispatchEvent(new FileDropEvent('filedrop', { files, action }));
            }
            return true;
          }
        }
      });
      // @ts-ignore
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      dirReader.readEntries((entries:any) => {
        // tslint:disable-next-line:no-increment-decrement
        this._dragFileCount += entries.length + 1 - reduce;
        console.log(this._dragFileCount, 'ccc', item.name);
        // tslint:disable-next-line:no-increment-decrement
        for (const eItem of entries) {
          // tslint:disable-next-line:prefer-template
          this.traverseFileTree(eItem, path + item.name + '/', acceptVal, action, 2);
        }
      });
    }
    return this.files;
  }

  private _onDragEnter(event: DragEvent) {
    this._dragEnterCount += 1;
    if (this._dragEnterCount > 1) return;
    if (event.dataTransfer === null) {
      this.classList.add('drop-invalid');
      return;
    }

    // We don't have data, attempt to get it and if it matches, set the correct state.
    const items = event.dataTransfer.items;
    // tslint:disable-next-line:max-line-length
    const matchingFiles = getMatchingItems(items, this.accept, (this.multiple !== null));
    const validDrop: boolean = event.dataTransfer && event.dataTransfer.items.length ?
      (matchingFiles[0] !== undefined) :
      // Safari doesn't give file information on drag enter, so the best we
      // can do is return valid.
      true;

    if (validDrop) {
      this.classList.add('drop-valid');
    } else {
      this.classList.add('drop-invalid');
    }
  }

  private _onDragLeave() {
    this._dragEnterCount -= 1;
    if (this._dragEnterCount === 0) {
      this._reset();
    }
  }

  private _onDrop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer === null) return;
    this._reset();
    const action = 'drop';
    // tslint:disable-next-line:max-line-length
    const files = this.getFileData(event.dataTransfer, this.accept, (this.multiple !== null), (this.directory !== null), action);
    if (files === undefined) return;
    // this.dispatchEvent(new FileDropEvent('filedrop', { action, files }));
  }

  private _onPaste(event: ClipboardEvent) {
    const action = 'paste';
    if (!event.clipboardData) return;
    // tslint:disable-next-line:max-line-length
    const files = this.getFileData(event.clipboardData, this.accept, (this.multiple !== undefined), (this.directory !== null), action);
    if (files === undefined) return;

    // this.dispatchEvent(new FileDropEvent('filedrop', { action, files }));
  }

  private _reset() {
    this.files = [];
    this._dragEnterCount = 0;
    this.classList.remove('drop-valid');
    this.classList.remove('drop-invalid');
  }
}

customElements.define('file-drop', FileDropElement);
