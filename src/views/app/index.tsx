// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as React from "react";
import * as ReactDOM from "react-dom";
import { Provider } from "react-redux";
import { browserHistory, IndexRoute, Link, Route, Router } from "react-router";
import { applyMiddleware, createStore } from "redux";
import BoardConfig from "./components/BoardConfig";
import BoardManager from "./components/BoardManager";
import ExampleTreeView from "./components/ExampleTreeView";
import LibraryManager from "./components/LibraryManager";
import SerialPlotter from "./components/SerialPlotter";
import reducer from "./reducers";
import "./styles";

class App extends React.Component<{}, {}> {
  public render() {
    return (<div>
        <div>
          { this.props.children }
        </div>
      </div>);
  }
}

const createStoreWithMiddleware = applyMiddleware()(createStore);
const store = createStoreWithMiddleware(reducer);

ReactDOM.render(
  <Provider store={store}>
    <Router history={ browserHistory }>
      <Route path="/" component={App}>
        <Route path="boardmanager" component={BoardManager} />
        <Route path="librarymanager" component={LibraryManager} />
        <Route path="boardconfig" component={BoardConfig} />
        <Route path="examples" component={ExampleTreeView} />
        <Route path="serialplotter" component={SerialPlotter} />
      </Route>
    </Router>
  </Provider>,
  document.getElementById("mainContent"));
