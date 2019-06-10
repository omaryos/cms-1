<?php
/**
 * @link https://craftcms.com/
 * @copyright Copyright (c) Pixel & Tonic, Inc.
 * @license https://craftcms.github.io/license/
 */

namespace craftunit\gql;

use Codeception\Test\Unit;
use Craft;
use craft\elements\Asset;
use craft\fields\Date;
use craft\gql\directives\FormatDateTime;
use craft\gql\directives\Transform;
use craft\gql\GqlEntityRegistry;
use craft\gql\types\Asset as GqlAssetType;
use craft\gql\types\Entry as GqlEntryType;
use craft\helpers\Json;
use craft\test\mockclasses\elements\ExampleElement;
use craft\test\mockclasses\gql\MockDirective;
use crafttests\fixtures\AssetsFixture;
use crafttests\fixtures\TransformsFixture;
use DateTime;
use GraphQL\Type\Definition\ResolveInfo;

class DirectiveTest extends Unit
{
    /**
     * @var \UnitTester
     */
    protected $tester;

    protected function _before()
    {
    }

    protected function _after()
    {
    }

    public function _fixtures()
    {
        return [
            'assets' => [
                'class' => AssetsFixture::class
            ],
            'transforms' => [
                'class' => TransformsFixture::class
            ]
        ];
    }

    // Tests
    // =========================================================================

    /**
     * Test directives
     *
     * @dataProvider directiveDataProvider
     *
     * @param string $in input string
     * @param array $directives an array of directive data as expected by GQL
     * @param string $result expected result
     */
    public function testDirectivesBeingApplied($in, array $directives, $result)
    {
        /** @var GqlEntryType $type */
        $type = $this->make(GqlEntryType::class);
        $element = new ExampleElement();
        $element->someField = $in;

        $fieldNodes = [Json::decode('{"directives":[' . implode(',', $directives) . ']}', false)];

        $resolveInfo = $this->make(ResolveInfo::class, [
            'fieldName' => 'someField',
            'fieldNodes' => $fieldNodes
        ]);

        $this->assertEquals($result, $type->resolveWithDirectives($element, [], null, $resolveInfo));
    }

    /**
     * Test transform directive
     *
     * @dataProvider assetTransformDirectiveDataProvider
     *
     * @param array $directives an array of directive data as expected by GQL
     * @param array $parameters transform parameters
     * @param boolean $mustNotBeSame Whether the results should differ instead
     */
    public function testTransformDirective(array $directives, $parameters, $mustNotBeSame = false)
    {
        /** @var Asset $asset */
        $asset = Asset::find()->filename('product.jpg')->folderId(1000)->one();

        /** @var GqlAssetType $type */
        $type = $this->make(GqlAssetType::class);

        $fieldNodes = [Json::decode('{"directives":[' . implode(',', $directives) . ']}', false)];

        $resolveInfo = $this->make(ResolveInfo::class, [
            'fieldName' => 'url',
            'fieldNodes' => $fieldNodes
        ]);

        $generateNow = $parameters['immediately'] ?? Craft::$app->getConfig()->general->generateTransformsBeforePageLoad;
        unset($parameters['immediately']);

        // `handle` parameter overrides everything else.
        if (!empty($parameters['handle'])) {
            $parameters = $parameters['handle'];
        }

        if ($mustNotBeSame) {
            $this->assertNotEquals(Craft::$app->getAssets()->getAssetUrl($asset, $parameters, $generateNow), $type->resolveWithDirectives($asset, [], null, $resolveInfo));
        } else {
            $this->assertEquals(Craft::$app->getAssets()->getAssetUrl($asset, $parameters, $generateNow), $type->resolveWithDirectives($asset, [], null, $resolveInfo));
        }
    }

    /**
     * Test if transform is only correctly applied to URL.
     *
     */
    public function testTransformOnlyUrl()
    {
        /** @var Asset $asset */
        $asset = Asset::find()->filename('product.jpg')->folderId(1000)->one();

        /** @var GqlAssetType $type */
        $type = $this->make(GqlAssetType::class);

        $fieldNodes = [Json::decode('{"directives":[' . $this->_buildDirective(Transform::class, ['width' => 200]) . ']}', false)];

        $resolveInfo = $this->make(ResolveInfo::class, [
            'fieldName' => 'filename',
            'fieldNodes' => $fieldNodes
        ]);

        $this->assertEquals($asset->filename, $type->resolveWithDirectives($asset, [], null, $resolveInfo));
    }

    // Data Providers
    // =========================================================================

    public function directiveDataProvider()
    {
        $mockDirective = MockDirective::class;
        $formatDateTime = FormatDateTime::class;

        $dateTime = new DateTime('now');

        $dateTimeParameters = [
            ['format' => 'Y-m-d H:i:s'],
            ['format' => DateTime::ATOM],
            ['format' => DateTime::COOKIE],
            ['format' => DateTime::COOKIE, 'timezone' => 'America/New_York'],
        ];

        return [
            // Mock directive
            ['TestString', [$this->_buildDirective($mockDirective, ['prefix' => 'Foo'])], 'FooTestString'],
            ['TestString', [$this->_buildDirective($mockDirective, ['prefix' => 'Bar']), $this->_buildDirective($mockDirective, ['prefix' => 'Foo'])], 'FooBarTestString'],

            // format date time (not as handy as for transform parameters, but still better than duplicating formats.
            [$dateTime, [$this->_buildDirective($formatDateTime, $dateTimeParameters[0])], $dateTime->format($dateTimeParameters[0]['format'])],
            [$dateTime, [$this->_buildDirective($formatDateTime, $dateTimeParameters[1])], $dateTime->format($dateTimeParameters[1]['format'])],
            [$dateTime, [$this->_buildDirective($formatDateTime, $dateTimeParameters[2])], $dateTime->format($dateTimeParameters[2]['format'])],
            [$dateTime, [$this->_buildDirective($formatDateTime, $dateTimeParameters[3])], $dateTime->setTimezone(new \DateTimeZone($dateTimeParameters[3]['timezone']))->format($dateTimeParameters[3]['format'])],
            ['what time is it?', [$this->_buildDirective($formatDateTime, $dateTimeParameters[2])], 'what time is it?'],
        ];
    }

    public function assetTransformDirectiveDataProvider()
    {
        $assetTransform = Transform::class;

        $transformParameters = [
            ['width' => 20, 'immediately' => true],
            ['handle' => 'anExampleTransform', 'immediately' => false],
            ['handle' => 'anExampleTransform', 'immediately' => true],
            ['mode' => 'crop', 'width' => 25, 'immediately' => true],
            ['mode' => 'fit', 'width' => 30, 'height' => 40, 'format' => 'png', 'position' => 'top-left', 'interlace' => 'line', 'quality' => 5, 'immediately' => true],
            ['width' => 25, 'immediately' => false],
        ];

        // asset transform
        return [
            [[$this->_buildDirective($assetTransform, $transformParameters[0])], $transformParameters[0]],
            [[$this->_buildDirective($assetTransform, $transformParameters[1])], $transformParameters[1]],
            [[$this->_buildDirective($assetTransform, $transformParameters[2])], $transformParameters[2]],
            [[$this->_buildDirective($assetTransform, $transformParameters[3])], $transformParameters[3]],
            [[$this->_buildDirective($assetTransform, $transformParameters[4])], $transformParameters[4]],
            [[$this->_buildDirective($assetTransform, $transformParameters[5])], $transformParameters[5]],
        ];
    }

    /**
     * Build the JSON string to be used as a directive object
     * 
     * @param string $className
     * @param array $arguments
     * @return string
     */
    private function _buildDirective(string $className, array $arguments = [])
    {
        $this->_registerDirective($className);

        $directiveTemplate = '{"name": {"value": "%s"}, "arguments": [%s]}';
        $argumentTemplate = '{"name": {"value":"%s"}, "value": {"value": "%s"}}';

        $argumentList = [];
        foreach ($arguments as $key => $value) {
            $argumentList[] = sprintf($argumentTemplate, $key, addslashes($value));
        }

        return sprintf($directiveTemplate, $className::getName(), implode(', ', $argumentList));
    }

    /**
     * Register a directive by class name.
     *
     * @param $className
     */
    private function _registerDirective($className) {
        // Make sure the mock directive is available in the entity registry
        $directiveName = $className::getName();

        if (!GqlEntityRegistry::getEntity($directiveName)) {
            GqlEntityRegistry::createEntity($directiveName, $className::getDirective());
        }

    }
}