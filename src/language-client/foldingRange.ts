'use strict'
import { CancellationToken, ClientCapabilities, Disposable, DocumentSelector, FoldingRange, FoldingRangeOptions, FoldingRangeParams, FoldingRangeRegistrationOptions, FoldingRangeRequest, ServerCapabilities } from 'vscode-languageserver-protocol'
import { TextDocument } from 'vscode-languageserver-textdocument'
import languages from '../languages'
import { FoldingContext, FoldingRangeProvider, ProviderResult } from '../provider'
import { TextDocumentLanguageFeature, FeatureClient, ensure } from './features'

export type ProvideFoldingRangeSignature = (
  this: void,
  document: TextDocument,
  context: FoldingContext,
  token: CancellationToken
) => ProviderResult<FoldingRange[]>

export interface FoldingRangeProviderMiddleware {
  provideFoldingRanges?: (
    this: void,
    document: TextDocument,
    context: FoldingContext,
    token: CancellationToken,
    next: ProvideFoldingRangeSignature
  ) => ProviderResult<FoldingRange[]>
}

export class FoldingRangeFeature extends TextDocumentLanguageFeature<
  boolean | FoldingRangeOptions, FoldingRangeRegistrationOptions, FoldingRangeProvider, FoldingRangeProviderMiddleware
> {
  constructor(client: FeatureClient<FoldingRangeProviderMiddleware>) {
    super(client, FoldingRangeRequest.type)
  }

  public fillClientCapabilities(capabilities: ClientCapabilities): void {
    let capability = ensure(ensure(capabilities, 'textDocument')!, 'foldingRange')!
    capability.dynamicRegistration = true
    capability.rangeLimit = 5000
    capability.lineFoldingOnly = true
  }

  public initialize(
    capabilities: ServerCapabilities,
    documentSelector: DocumentSelector
  ): void {
    const [id, options] = this.getRegistration(documentSelector, capabilities.foldingRangeProvider)
    if (!id || !options) {
      return
    }
    this.register({ id, registerOptions: options })
  }

  protected registerLanguageProvider(
    options: FoldingRangeRegistrationOptions
  ): [Disposable, FoldingRangeProvider] {
    const provider: FoldingRangeProvider = {
      provideFoldingRanges: (document, context, token) => {
        const client = this._client
        const provideFoldingRanges: ProvideFoldingRangeSignature = (document, _, token) => {
          const requestParams: FoldingRangeParams = {
            textDocument: { uri: document.uri }
          }
          return client.sendRequest(FoldingRangeRequest.type, requestParams, token).then(
            res => token.isCancellationRequested ? null : res, (error: any) => {
              return client.handleFailedRequest(FoldingRangeRequest.type, token, error, null)
            }
          )
        }
        const middleware = client.middleware
        return middleware.provideFoldingRanges
          ? middleware.provideFoldingRanges(document, context, token, provideFoldingRanges)
          : provideFoldingRanges(document, context, token)
      }
    }

    return [languages.registerFoldingRangeProvider(options.documentSelector, provider), provider]
  }
}
